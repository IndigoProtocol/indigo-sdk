import {
  addAssets,
  Emulator,
  EmulatorAccount,
  fromText,
  generateEmulatorAccount,
  Lucid,
  paymentCredentialOf,
  stakeCredentialOf,
  UTxO,
} from '@lucid-evolution/lucid';
import { assert, beforeEach, describe, expect, test } from 'vitest';
import { LucidContext, repeat, runAndAwaitTx } from './test-helpers';
import {
  assetClassValueOf,
  lovelacesAmt,
  mkLovelacesOf,
} from '../src/helpers/value-helpers';
import { AssetInfo, init } from './endpoints/initialize';
import {
  addrDetails,
  burnCdp,
  CDPContent,
  closeCdp,
  createScriptAddress,
  depositCdp,
  freezeCdp,
  fromSystemParamsAsset,
  getInlineDatumOrThrow,
  IAssetOutput,
  InterestOracleDatum,
  liquidateCdp,
  matchSingle,
  mergeCdps,
  mintCdp,
  openCdp,
  parseInterestOracleDatum,
  parsePriceOracleDatum,
  redeemCdp,
  StabilityPoolContract,
  SystemParams,
  withdrawCdp,
} from '../src';
import {
  findAllActiveCdps,
  findCdp,
  findFrozenCDPs,
  findRandomCdpCreator,
} from './queries/cdp-queries';
import { findIAsset } from './queries/iasset-queries';
import { findPriceOracle } from './queries/price-oracle-queries';
import { match, P } from 'ts-pattern';
import { findRandomCollector } from './queries/collector-queries';
import { findGov } from './queries/governance-queries';
import { findRandomTreasuryUtxo } from './queries/treasury-queries';
import { getValueChangeAtAddressAfterAction } from './utils';
import { cdpCollateralRatioPercentage } from '../src/helpers/cdp-helpers';
import { OnChainDecimal } from '../src/types/on-chain-decimal';
import { findInterestOracle } from './queries/interest-oracle-queries';
import { feedPriceOracleTx } from '../src/contracts/price-oracle';
import { iusdInitialAssetCfg } from './mock/assets-mock';
import { assertValueInRange } from './utils/asserts';
import {
  findStabilityPool,
  findStabilityPoolAccount,
} from './queries/stability-pool-queries';

type MyContext = LucidContext<{
  admin: EmulatorAccount;
  user: EmulatorAccount;
}>;

async function findAllNecessaryOrefs(
  context: MyContext,
  sysParams: SystemParams,
  asset: string,
): Promise<{
  stabilityPoolUtxo: UTxO;
  iasset: IAssetOutput;
  cdpCreatorUtxo: UTxO;
  priceOracleUtxo: UTxO;
  interestOracleUtxo: UTxO;
  collectorUtxo: UTxO;
  govUtxo: UTxO;
  treasuryUtxo: UTxO;
}> {
  const iasset = await findIAsset(
    context.lucid,
    sysParams.validatorHashes.cdpHash,
    fromSystemParamsAsset(sysParams.cdpParams.iAssetAuthToken),
    asset,
  );

  const stabilityPool = await findStabilityPool(
    context.lucid,
    sysParams.validatorHashes.stabilityPoolHash,
    fromSystemParamsAsset(sysParams.stabilityPoolParams.stabilityPoolToken),
    asset,
  );

  return {
    stabilityPoolUtxo: stabilityPool,
    iasset,
    cdpCreatorUtxo: await findRandomCdpCreator(
      context.lucid,
      sysParams.validatorHashes.cdpCreatorHash,
      fromSystemParamsAsset(sysParams.cdpCreatorParams.cdpCreatorNft),
    ),
    priceOracleUtxo: await findPriceOracle(
      context.lucid,
      match(iasset.datum.price)
        .with({ Oracle: { content: P.select() } }, (oracleNft) => oracleNft)
        .otherwise(() => {
          throw new Error('Expected active oracle');
        }),
    ),
    interestOracleUtxo: await findInterestOracle(
      context.lucid,
      iasset.datum.interestOracleNft,
    ),
    collectorUtxo: await findRandomCollector(
      context.lucid,
      sysParams.validatorHashes.collectorHash,
    ),
    govUtxo: (
      await findGov(
        context.lucid,
        sysParams.validatorHashes.govHash,
        fromSystemParamsAsset(sysParams.govParams.govNFT),
      )
    ).utxo,
    treasuryUtxo: await findRandomTreasuryUtxo(
      context.lucid,
      sysParams.validatorHashes.treasuryHash,
    ),
  };
}

async function findPrice(
  context: MyContext,
  sysParams: SystemParams,
  asset: string,
): Promise<OnChainDecimal> {
  const orefs = await findAllNecessaryOrefs(context, sysParams, asset);

  const priceOracleUtxo = matchSingle(
    await context.lucid.utxosByOutRef([orefs.priceOracleUtxo]),
    (_) => new Error('Expected a single price oracle UTXO'),
  );
  const priceOracleDatum = parsePriceOracleDatum(
    getInlineDatumOrThrow(priceOracleUtxo),
  );

  return priceOracleDatum.price;
}

async function findInterestDatum(
  context: MyContext,
  sysParams: SystemParams,
  asset: string,
): Promise<InterestOracleDatum> {
  const orefs = await findAllNecessaryOrefs(context, sysParams, asset);

  const interestOracleUtxo = matchSingle(
    await context.lucid.utxosByOutRef([orefs.interestOracleUtxo]),
    (_) => new Error('Expected a single interest oracle UTXO'),
  );
  return parseInterestOracleDatum(getInlineDatumOrThrow(interestOracleUtxo));
}

async function findCdpCR(
  context: MyContext,
  sysParams: SystemParams,
  tokenAssetInfo: AssetInfo,
  cdp: { utxo: UTxO; datum: CDPContent },
): Promise<number> {
  return cdpCollateralRatioPercentage(
    context.emulator.slot,
    await findPrice(context, sysParams, tokenAssetInfo.iassetTokenNameAscii),
    cdp.utxo,
    cdp.datum,
    await findInterestDatum(
      context,
      sysParams,
      tokenAssetInfo.iassetTokenNameAscii,
    ),
    context.lucid.config().network!,
  );
}

describe('CDP', () => {
  beforeEach<MyContext>(async (context: MyContext) => {
    context.users = {
      admin: generateEmulatorAccount({
        lovelace: BigInt(100_000_000_000_000),
      }),
      user: generateEmulatorAccount(addAssets(mkLovelacesOf(150_000_000n))),
    };

    context.emulator = new Emulator([context.users.admin, context.users.user]);
    context.lucid = await Lucid(context.emulator, 'Custom');
  });

  test<MyContext>('Open CDP', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, _] = await init(context.lucid, [iusdInitialAssetCfg]);

    const asset = 'iUSD';

    const orefs = await findAllNecessaryOrefs(context, sysParams, asset);

    await runAndAwaitTx(
      context.lucid,
      openCdp(
        10_000_000n,
        500_000n,
        sysParams,
        orefs.cdpCreatorUtxo,
        orefs.iasset.utxo,
        orefs.priceOracleUtxo,
        orefs.interestOracleUtxo,
        orefs.collectorUtxo,
        context.lucid,
        context.emulator.slot,
      ),
    );
  });

  test<MyContext>('Deposit CDP', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [pkh, skh] = await addrDetails(context.lucid);

    const [sysParams, _] = await init(context.lucid, [iusdInitialAssetCfg]);

    const asset = 'iUSD';

    const initialMint = 500_000n;
    const initialCollateral = 10_000_000n;

    {
      const orefs = await findAllNecessaryOrefs(context, sysParams, asset);

      await runAndAwaitTx(
        context.lucid,
        openCdp(
          initialCollateral,
          initialMint,
          sysParams,
          orefs.cdpCreatorUtxo,
          orefs.iasset.utxo,
          orefs.priceOracleUtxo,
          orefs.interestOracleUtxo,
          orefs.collectorUtxo,
          context.lucid,
          context.emulator.slot,
        ),
      );
    }

    context.emulator.awaitSlot(1000);

    {
      const cdp = await findCdp(
        context.lucid,
        sysParams.validatorHashes.cdpHash,
        fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
        pkh.hash,
        skh,
      );
      const orefs = await findAllNecessaryOrefs(context, sysParams, asset);

      const [_, treasuryValChange] = await getValueChangeAtAddressAfterAction(
        context.lucid,
        createScriptAddress(
          context.lucid.config().network!,
          sysParams.validatorHashes.treasuryHash,
        ),
        () =>
          runAndAwaitTx(
            context.lucid,
            depositCdp(
              1_000_000n,
              cdp.utxo,
              orefs.iasset.utxo,
              orefs.priceOracleUtxo,
              orefs.interestOracleUtxo,
              orefs.collectorUtxo,
              orefs.govUtxo,
              orefs.treasuryUtxo,
              sysParams,
              context.lucid,
              context.emulator.slot,
            ),
          ),
      );

      assert(
        lovelacesAmt(treasuryValChange) > 0,
        'Expected some interest paid to treasury',
      );
    }

    const cdp = await findCdp(
      context.lucid,
      sysParams.validatorHashes.cdpHash,
      fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
      pkh.hash,
      skh,
    );

    expect(cdp.datum.mintedAmt).toBe(initialMint);
    expect(lovelacesAmt(cdp.utxo.assets)).toBe(initialCollateral + 1_000_000n);
  });

  test<MyContext>('Withdraw CDP', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [pkh, skh] = await addrDetails(context.lucid);

    const [sysParams, _] = await init(context.lucid, [iusdInitialAssetCfg]);

    const asset = 'iUSD';

    const initialMint = 500_000n;
    const initialCollateral = 15_000_000n;

    {
      const orefs = await findAllNecessaryOrefs(context, sysParams, asset);

      await runAndAwaitTx(
        context.lucid,
        openCdp(
          initialCollateral,
          initialMint,
          sysParams,
          orefs.cdpCreatorUtxo,
          orefs.iasset.utxo,
          orefs.priceOracleUtxo,
          orefs.interestOracleUtxo,
          orefs.collectorUtxo,
          context.lucid,
          context.emulator.slot,
        ),
      );
    }

    context.emulator.awaitSlot(100);

    {
      const cdp = await findCdp(
        context.lucid,
        sysParams.validatorHashes.cdpHash,
        fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
        pkh.hash,
        skh,
      );
      const orefs = await findAllNecessaryOrefs(context, sysParams, asset);

      const [_, treasuryValChange] = await getValueChangeAtAddressAfterAction(
        context.lucid,
        createScriptAddress(
          context.lucid.config().network!,
          sysParams.validatorHashes.treasuryHash,
        ),
        () =>
          runAndAwaitTx(
            context.lucid,
            withdrawCdp(
              4_000_000n,
              cdp.utxo,
              orefs.iasset.utxo,
              orefs.priceOracleUtxo,
              orefs.interestOracleUtxo,
              orefs.collectorUtxo,
              orefs.govUtxo,
              orefs.treasuryUtxo,
              sysParams,
              context.lucid,
              context.emulator.slot,
            ),
          ),
      );

      assert(
        lovelacesAmt(treasuryValChange) > 0,
        'Expected some interest paid to treasury',
      );
    }

    const cdp = await findCdp(
      context.lucid,
      sysParams.validatorHashes.cdpHash,
      fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
      pkh.hash,
      skh,
    );

    expect(cdp.datum.mintedAmt).toBe(initialMint);
    expect(lovelacesAmt(cdp.utxo.assets)).toBe(initialCollateral - 4_000_000n);
  });

  test<MyContext>('Mint CDP', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [pkh, skh] = await addrDetails(context.lucid);

    const [sysParams, _] = await init(context.lucid, [iusdInitialAssetCfg]);

    const asset = 'iUSD';

    const initialMint = 500_000n;
    const initialCollateral = 12_000_000n;

    {
      const orefs = await findAllNecessaryOrefs(context, sysParams, asset);

      await runAndAwaitTx(
        context.lucid,
        openCdp(
          initialCollateral,
          initialMint,
          sysParams,
          orefs.cdpCreatorUtxo,
          orefs.iasset.utxo,
          orefs.priceOracleUtxo,
          orefs.interestOracleUtxo,
          orefs.collectorUtxo,
          context.lucid,
          context.emulator.slot,
        ),
      );
    }

    context.emulator.awaitSlot(100);

    {
      const cdp = await findCdp(
        context.lucid,
        sysParams.validatorHashes.cdpHash,
        fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
        pkh.hash,
        skh,
      );
      const orefs = await findAllNecessaryOrefs(context, sysParams, asset);

      const [_, treasuryValChange] = await getValueChangeAtAddressAfterAction(
        context.lucid,
        createScriptAddress(
          context.lucid.config().network!,
          sysParams.validatorHashes.treasuryHash,
        ),
        () =>
          runAndAwaitTx(
            context.lucid,
            mintCdp(
              1_000n,
              cdp.utxo,
              orefs.iasset.utxo,
              orefs.priceOracleUtxo,
              orefs.interestOracleUtxo,
              orefs.collectorUtxo,
              orefs.govUtxo,
              orefs.treasuryUtxo,
              sysParams,
              context.lucid,
              context.emulator.slot,
            ),
          ),
      );

      assert(
        lovelacesAmt(treasuryValChange) > 0,
        'Expected some interest paid to treasury',
      );
    }

    const cdp = await findCdp(
      context.lucid,
      sysParams.validatorHashes.cdpHash,
      fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
      pkh.hash,
      skh,
    );

    expect(cdp.datum.mintedAmt).toBe(initialMint + 1_000n);
    expect(lovelacesAmt(cdp.utxo.assets)).toBe(initialCollateral);
  });

  test<MyContext>('Burn CDP', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [pkh, skh] = await addrDetails(context.lucid);

    const [sysParams, _] = await init(context.lucid, [iusdInitialAssetCfg]);

    const asset = 'iUSD';

    const initialMint = 500_000n;
    const initialCollateral = 12_000_000n;

    {
      const orefs = await findAllNecessaryOrefs(context, sysParams, asset);

      await runAndAwaitTx(
        context.lucid,
        openCdp(
          initialCollateral,
          initialMint,
          sysParams,
          orefs.cdpCreatorUtxo,
          orefs.iasset.utxo,
          orefs.priceOracleUtxo,
          orefs.interestOracleUtxo,
          orefs.collectorUtxo,
          context.lucid,
          context.emulator.slot,
        ),
      );
    }

    context.emulator.awaitSlot(1000);

    {
      const cdp = await findCdp(
        context.lucid,
        sysParams.validatorHashes.cdpHash,
        fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
        pkh.hash,
        skh,
      );
      const orefs = await findAllNecessaryOrefs(context, sysParams, asset);

      const [_, treasuryValChange] = await getValueChangeAtAddressAfterAction(
        context.lucid,
        createScriptAddress(
          context.lucid.config().network!,
          sysParams.validatorHashes.treasuryHash,
        ),
        () =>
          runAndAwaitTx(
            context.lucid,
            burnCdp(
              1_000n,
              cdp.utxo,
              orefs.iasset.utxo,
              orefs.priceOracleUtxo,
              orefs.interestOracleUtxo,
              orefs.collectorUtxo,
              orefs.govUtxo,
              orefs.treasuryUtxo,
              sysParams,
              context.lucid,
              context.emulator.slot,
            ),
          ),
      );

      assert(
        lovelacesAmt(treasuryValChange) > 0,
        'Expected some interest paid to treasury',
      );
    }

    const cdp = await findCdp(
      context.lucid,
      sysParams.validatorHashes.cdpHash,
      fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
      pkh.hash,
      skh,
    );

    expect(cdp.datum.mintedAmt).toBe(initialMint - 1_000n);
    expect(lovelacesAmt(cdp.utxo.assets)).toBe(initialCollateral);
  });

  test<MyContext>('Close CDP', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [pkh, skh] = await addrDetails(context.lucid);

    const [sysParams, _] = await init(context.lucid, [iusdInitialAssetCfg]);

    const asset = 'iUSD';

    {
      const orefs = await findAllNecessaryOrefs(context, sysParams, asset);

      await runAndAwaitTx(
        context.lucid,
        openCdp(
          10_000_000n,
          500_000n,
          sysParams,
          orefs.cdpCreatorUtxo,
          orefs.iasset.utxo,
          orefs.priceOracleUtxo,
          orefs.interestOracleUtxo,
          orefs.collectorUtxo,
          context.lucid,
          context.emulator.slot,
        ),
      );
    }

    context.emulator.awaitSlot(1000);

    {
      const cdp = await findCdp(
        context.lucid,
        sysParams.validatorHashes.cdpHash,
        fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
        pkh.hash,
        skh,
      );

      const orefs = await findAllNecessaryOrefs(context, sysParams, asset);

      await runAndAwaitTx(
        context.lucid,
        closeCdp(
          cdp.utxo,
          orefs.iasset.utxo,
          orefs.priceOracleUtxo,
          orefs.interestOracleUtxo,
          orefs.collectorUtxo,
          orefs.govUtxo,
          orefs.treasuryUtxo,
          sysParams,
          context.lucid,
          context.emulator.slot,
        ),
      );
    }
  });

  test<MyContext>('Redeem CDP', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [pkh, skh] = await addrDetails(context.lucid);

    const [sysParams, [iusdAssetInfo]] = await init(context.lucid, [
      iusdInitialAssetCfg,
    ]);

    {
      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        openCdp(
          20_000_000n,
          10_000_000n,
          sysParams,
          orefs.cdpCreatorUtxo,
          orefs.iasset.utxo,
          orefs.priceOracleUtxo,
          orefs.interestOracleUtxo,
          orefs.collectorUtxo,
          context.lucid,
          context.emulator.slot,
        ),
      );
    }

    // Add iAssets to user's wallet
    {
      context.lucid.selectWallet.fromSeed(context.users.user.seedPhrase);

      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        openCdp(
          50_000_000n,
          10_000_000n,
          sysParams,
          orefs.cdpCreatorUtxo,
          orefs.iasset.utxo,
          orefs.priceOracleUtxo,
          orefs.interestOracleUtxo,
          orefs.collectorUtxo,
          context.lucid,
          context.emulator.slot,
        ),
      );

      context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);
    }

    {
      const cdp = await findCdp(
        context.lucid,
        sysParams.validatorHashes.cdpHash,
        fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
        pkh.hash,
        skh,
      );

      assertValueInRange(
        await findCdpCR(context, sysParams, iusdAssetInfo, cdp),
        { min: 199, max: 200 },
      );

      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        feedPriceOracleTx(
          context.lucid,
          orefs.priceOracleUtxo,
          {
            getOnChainInt: 1_250_000n,
          },
          iusdAssetInfo.oracleParams,
          context.emulator.slot,
        ),
      );

      assertValueInRange(
        await findCdpCR(context, sysParams, iusdAssetInfo, cdp),
        { min: 159, max: 160 },
      );
    }

    {
      // Let user do the redemption (i.e. not the CDP's owner)
      context.lucid.selectWallet.fromSeed(context.users.user.seedPhrase);

      const cdp = await findCdp(
        context.lucid,
        sysParams.validatorHashes.cdpHash,
        fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
        pkh.hash,
        skh,
      );

      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        redeemCdp(
          cdp.datum.mintedAmt,
          cdp.utxo,
          orefs.iasset.utxo,
          orefs.priceOracleUtxo,
          orefs.interestOracleUtxo,
          orefs.collectorUtxo,
          orefs.treasuryUtxo,
          sysParams,
          context.lucid,
          context.emulator.slot,
        ),
      );

      context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);
    }

    {
      const cdp = await findCdp(
        context.lucid,
        sysParams.validatorHashes.cdpHash,
        fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
        pkh.hash,
        skh,
      );

      assertValueInRange(
        await findCdpCR(context, sysParams, iusdAssetInfo, cdp),
        { min: 199, max: 201 },
      );
    }
  });

  test<MyContext>('Freeze CDP', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [pkh, skh] = await addrDetails(context.lucid);

    const [sysParams, [iusdAssetInfo]] = await init(context.lucid, [
      iusdInitialAssetCfg,
    ]);

    {
      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        openCdp(
          20_000_000n,
          10_000_000n,
          sysParams,
          orefs.cdpCreatorUtxo,
          orefs.iasset.utxo,
          orefs.priceOracleUtxo,
          orefs.interestOracleUtxo,
          orefs.collectorUtxo,
          context.lucid,
          context.emulator.slot,
        ),
      );
    }

    context.emulator.awaitSlot(1000);

    {
      const cdp = await findCdp(
        context.lucid,
        sysParams.validatorHashes.cdpHash,
        fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
        pkh.hash,
        skh,
      );

      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        feedPriceOracleTx(
          context.lucid,
          orefs.priceOracleUtxo,
          {
            getOnChainInt: 1_800_000n,
          },
          iusdAssetInfo.oracleParams,
          context.emulator.slot,
        ),
      );

      assertValueInRange(
        await findCdpCR(context, sysParams, iusdAssetInfo, cdp),
        { min: 111, max: 112 },
      );
    }

    {
      const cdp = await findCdp(
        context.lucid,
        sysParams.validatorHashes.cdpHash,
        fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
        pkh.hash,
        skh,
      );

      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        freezeCdp(
          cdp.utxo,
          orefs.iasset.utxo,
          orefs.priceOracleUtxo,
          orefs.interestOracleUtxo,
          sysParams,
          context.lucid,
          context.emulator.slot,
        ),
      );
    }

    {
      const frozenCdp = matchSingle(
        await findFrozenCDPs(
          context.lucid,
          sysParams.validatorHashes.cdpHash,
          fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
          iusdAssetInfo.iassetTokenNameAscii,
        ),
        (_) => new Error('Expected only single frozen CDP'),
      );

      expect(
        frozenCdp.datum.mintedAmt === 10_000_000n &&
          frozenCdp.datum.cdpOwner == null,
        'Expected frozen certain frozen CDP',
      ).toBeTruthy();
    }
  });

  test<MyContext>('Liquidate CDP', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, [iusdAssetInfo]] = await init(context.lucid, [
      iusdInitialAssetCfg,
    ]);

    {
      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      // This is the position that will get liquidated.
      await runAndAwaitTx(
        context.lucid,
        openCdp(
          10_000_000n,
          5_000_000n,
          sysParams,
          orefs.cdpCreatorUtxo,
          orefs.iasset.utxo,
          orefs.priceOracleUtxo,
          orefs.interestOracleUtxo,
          orefs.collectorUtxo,
          context.lucid,
          context.emulator.slot,
        ),
      );
    }

    context.lucid.selectWallet.fromSeed(context.users.user.seedPhrase);

    {
      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        openCdp(
          20_000_000n,
          10_000_000n,
          sysParams,
          orefs.cdpCreatorUtxo,
          orefs.iasset.utxo,
          orefs.priceOracleUtxo,
          orefs.interestOracleUtxo,
          orefs.collectorUtxo,
          context.lucid,
          context.emulator.slot,
        ),
      );

      await runAndAwaitTx(
        context.lucid,
        StabilityPoolContract.createAccount(
          iusdAssetInfo.iassetTokenNameAscii,
          10_000_000n,
          sysParams,
          context.lucid,
        ),
      );
    }

    // Process the create account request
    {
      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      const accountUtxo = await findStabilityPoolAccount(
        context.lucid,
        sysParams.validatorHashes.stabilityPoolHash,
        paymentCredentialOf(context.users.user.address).hash,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        StabilityPoolContract.processRequest(
          iusdAssetInfo.iassetTokenNameAscii,
          orefs.stabilityPoolUtxo,
          accountUtxo,
          orefs.govUtxo,
          orefs.iasset.utxo,
          undefined,
          sysParams,
          context.lucid,
          orefs.collectorUtxo,
        ),
      );
    }

    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    {
      const cdp = await findCdp(
        context.lucid,
        sysParams.validatorHashes.cdpHash,
        fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
        paymentCredentialOf(context.users.admin.address).hash,
        stakeCredentialOf(context.users.admin.address),
      );

      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        feedPriceOracleTx(
          context.lucid,
          orefs.priceOracleUtxo,
          {
            getOnChainInt: 1_800_000n,
          },
          iusdAssetInfo.oracleParams,
          context.emulator.slot,
        ),
      );

      assertValueInRange(
        await findCdpCR(context, sysParams, iusdAssetInfo, cdp),
        { min: 111, max: 112 },
      );
    }

    // We want user to do the freeze of admin's CDP
    context.lucid.selectWallet.fromSeed(context.users.user.seedPhrase);

    {
      const cdp = await findCdp(
        context.lucid,
        sysParams.validatorHashes.cdpHash,
        fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
        paymentCredentialOf(context.users.admin.address).hash,
        stakeCredentialOf(context.users.admin.address),
      );

      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        freezeCdp(
          cdp.utxo,
          orefs.iasset.utxo,
          orefs.priceOracleUtxo,
          orefs.interestOracleUtxo,
          sysParams,
          context.lucid,
          context.emulator.slot,
        ),
      );
    }

    {
      const frozenCdp = matchSingle(
        await findFrozenCDPs(
          context.lucid,
          sysParams.validatorHashes.cdpHash,
          fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
          iusdAssetInfo.iassetTokenNameAscii,
        ),
        (_) => new Error('Expected only single frozen CDP'),
      );

      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        liquidateCdp(
          frozenCdp.utxo,
          orefs.stabilityPoolUtxo,
          orefs.collectorUtxo,
          orefs.treasuryUtxo,
          sysParams,
          context.lucid,
        ),
      );
    }

    {
      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      expect(
        assetClassValueOf(orefs.stabilityPoolUtxo.assets, {
          currencySymbol: sysParams.cdpParams.cdpAssetSymbol.unCurrencySymbol,
          tokenName: fromText(iusdAssetInfo.iassetTokenNameAscii),
        }) === 5_000_000n,
        'Expected different stability pool iassets amount',
      ).toBeTruthy();
    }
  });

  test<MyContext>('Partialy liquidate CDP', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, [iusdAssetInfo]] = await init(context.lucid, [
      iusdInitialAssetCfg,
    ]);

    {
      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      // This is the position that will get liquidated.
      await runAndAwaitTx(
        context.lucid,
        openCdp(
          10_000_000n,
          5_000_000n,
          sysParams,
          orefs.cdpCreatorUtxo,
          orefs.iasset.utxo,
          orefs.priceOracleUtxo,
          orefs.interestOracleUtxo,
          orefs.collectorUtxo,
          context.lucid,
          context.emulator.slot,
        ),
      );
    }

    context.lucid.selectWallet.fromSeed(context.users.user.seedPhrase);

    {
      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        openCdp(
          20_000_000n,
          3_000_000n,
          sysParams,
          orefs.cdpCreatorUtxo,
          orefs.iasset.utxo,
          orefs.priceOracleUtxo,
          orefs.interestOracleUtxo,
          orefs.collectorUtxo,
          context.lucid,
          context.emulator.slot,
        ),
      );

      await runAndAwaitTx(
        context.lucid,
        StabilityPoolContract.createAccount(
          iusdAssetInfo.iassetTokenNameAscii,
          3_000_000n,
          sysParams,
          context.lucid,
        ),
      );
    }

    // Process the create account request
    {
      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      const accountUtxo = await findStabilityPoolAccount(
        context.lucid,
        sysParams.validatorHashes.stabilityPoolHash,
        paymentCredentialOf(context.users.user.address).hash,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        StabilityPoolContract.processRequest(
          iusdAssetInfo.iassetTokenNameAscii,
          orefs.stabilityPoolUtxo,
          accountUtxo,
          orefs.govUtxo,
          orefs.iasset.utxo,
          undefined,
          sysParams,
          context.lucid,
          orefs.collectorUtxo,
        ),
      );
    }

    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    {
      const cdp = await findCdp(
        context.lucid,
        sysParams.validatorHashes.cdpHash,
        fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
        paymentCredentialOf(context.users.admin.address).hash,
        stakeCredentialOf(context.users.admin.address),
      );

      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        feedPriceOracleTx(
          context.lucid,
          orefs.priceOracleUtxo,
          {
            getOnChainInt: 1_800_000n,
          },
          iusdAssetInfo.oracleParams,
          context.emulator.slot,
        ),
      );

      assertValueInRange(
        await findCdpCR(context, sysParams, iusdAssetInfo, cdp),
        { min: 111, max: 112 },
      );
    }

    // We want user to do the freeze of admin's CDP
    context.lucid.selectWallet.fromSeed(context.users.user.seedPhrase);

    {
      const cdp = await findCdp(
        context.lucid,
        sysParams.validatorHashes.cdpHash,
        fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
        paymentCredentialOf(context.users.admin.address).hash,
        stakeCredentialOf(context.users.admin.address),
      );

      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        freezeCdp(
          cdp.utxo,
          orefs.iasset.utxo,
          orefs.priceOracleUtxo,
          orefs.interestOracleUtxo,
          sysParams,
          context.lucid,
          context.emulator.slot,
        ),
      );
    }

    {
      const frozenCdp = matchSingle(
        await findFrozenCDPs(
          context.lucid,
          sysParams.validatorHashes.cdpHash,
          fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
          iusdAssetInfo.iassetTokenNameAscii,
        ),
        (_) => new Error('Expected only single frozen CDP'),
      );

      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        liquidateCdp(
          frozenCdp.utxo,
          orefs.stabilityPoolUtxo,
          orefs.collectorUtxo,
          orefs.treasuryUtxo,
          sysParams,
          context.lucid,
        ),
      );
    }

    {
      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      expect(
        assetClassValueOf(orefs.stabilityPoolUtxo.assets, {
          currencySymbol: sysParams.cdpParams.cdpAssetSymbol.unCurrencySymbol,
          tokenName: fromText(iusdAssetInfo.iassetTokenNameAscii),
        }) === 0n,
        'Expected different stability pool iassets amount',
      ).toBeTruthy();
    }
  });

  test<MyContext>('Merge CDPs and liquidate merged', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, [iusdAssetInfo]] = await init(context.lucid, [
      iusdInitialAssetCfg,
    ]);

    await repeat(3, async () => {
      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        openCdp(
          12_000_000n,
          6_000_000n,
          sysParams,
          orefs.cdpCreatorUtxo,
          orefs.iasset.utxo,
          orefs.priceOracleUtxo,
          orefs.interestOracleUtxo,
          orefs.collectorUtxo,
          context.lucid,
          context.emulator.slot,
        ),
      );
    });

    {
      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        feedPriceOracleTx(
          context.lucid,
          orefs.priceOracleUtxo,
          {
            getOnChainInt: 1_800_000n,
          },
          iusdAssetInfo.oracleParams,
          context.emulator.slot,
        ),
      );
    }

    {
      const activeCdps = await findAllActiveCdps(
        context.lucid,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
        stakeCredentialOf(context.users.admin.address),
      );

      expect(activeCdps.length === 3, 'Expected 3 cdps').toBeTruthy();

      for (const cdp of activeCdps) {
        const orefs = await findAllNecessaryOrefs(
          context,
          sysParams,
          iusdAssetInfo.iassetTokenNameAscii,
        );

        await runAndAwaitTx(
          context.lucid,
          freezeCdp(
            cdp.utxo,
            orefs.iasset.utxo,
            orefs.priceOracleUtxo,
            orefs.interestOracleUtxo,
            sysParams,
            context.lucid,
            context.emulator.slot,
          ),
        );
      }
    }

    {
      const frozenCdps = await findFrozenCDPs(
        context.lucid,
        sysParams.validatorHashes.cdpHash,
        fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
        iusdAssetInfo.iassetTokenNameAscii,
      );

      expect(frozenCdps.length === 3, 'Expected 3 frozen cdps').toBeTruthy();

      await runAndAwaitTx(
        context.lucid,
        mergeCdps(
          frozenCdps.map((cdp) => cdp.utxo),
          sysParams,
          context.lucid,
        ),
      );
    }

    ///////////////////////////
    // Liquidation
    ///////////////////////////

    context.lucid.selectWallet.fromSeed(context.users.user.seedPhrase);

    {
      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        openCdp(
          100_000_000n,
          20_000_000n,
          sysParams,
          orefs.cdpCreatorUtxo,
          orefs.iasset.utxo,
          orefs.priceOracleUtxo,
          orefs.interestOracleUtxo,
          orefs.collectorUtxo,
          context.lucid,
          context.emulator.slot,
        ),
      );

      await runAndAwaitTx(
        context.lucid,
        StabilityPoolContract.createAccount(
          iusdAssetInfo.iassetTokenNameAscii,
          20_000_000n,
          sysParams,
          context.lucid,
        ),
      );
    }

    // Process the create account request
    {
      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      const accountUtxo = await findStabilityPoolAccount(
        context.lucid,
        sysParams.validatorHashes.stabilityPoolHash,
        paymentCredentialOf(context.users.user.address).hash,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        StabilityPoolContract.processRequest(
          iusdAssetInfo.iassetTokenNameAscii,
          orefs.stabilityPoolUtxo,
          accountUtxo,
          orefs.govUtxo,
          orefs.iasset.utxo,
          undefined,
          sysParams,
          context.lucid,
          orefs.collectorUtxo,
        ),
      );
    }

    {
      const frozenCdp = matchSingle(
        await findFrozenCDPs(
          context.lucid,
          sysParams.validatorHashes.cdpHash,
          fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
          iusdAssetInfo.iassetTokenNameAscii,
        ),
        (_) => new Error('Expected only single frozen CDP'),
      );

      expect(
        frozenCdp.datum.mintedAmt === 18_000_000n &&
          frozenCdp.datum.cdpOwner == null,
        'Expected frozen certain frozen CDP',
      ).toBeTruthy();

      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      await runAndAwaitTx(
        context.lucid,
        liquidateCdp(
          frozenCdp.utxo,
          orefs.stabilityPoolUtxo,
          orefs.collectorUtxo,
          orefs.treasuryUtxo,
          sysParams,
          context.lucid,
        ),
      );
    }

    {
      const orefs = await findAllNecessaryOrefs(
        context,
        sysParams,
        iusdAssetInfo.iassetTokenNameAscii,
      );

      expect(
        assetClassValueOf(orefs.stabilityPoolUtxo.assets, {
          currencySymbol: sysParams.cdpParams.cdpAssetSymbol.unCurrencySymbol,
          tokenName: fromText(iusdAssetInfo.iassetTokenNameAscii),
        }) === 2_000_000n,
        'Expected different stability pool iassets amount',
      ).toBeTruthy();
    }
  });
});
