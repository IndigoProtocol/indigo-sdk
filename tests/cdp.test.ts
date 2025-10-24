import {
  addAssets,
  Emulator,
  EmulatorAccount,
  generateEmulatorAccount,
  Lucid,
  OutRef,
} from '@lucid-evolution/lucid';
import { assert, beforeEach, describe, expect, test } from 'vitest';
import { LucidContext, runAndAwaitTx } from './test-helpers';
import { lovelacesAmt, mkLovelacesOf } from '../src/helpers/value-helpers';
import { init } from './endpoints/initialize';
import {
  addrDetails,
  burnCdp,
  closeCdp,
  createScriptAddress,
  depositCdp,
  fromSystemParamsAsset,
  IAssetOutput,
  mintCdp,
  openCdp,
  SystemParams,
  withdrawCdp,
} from '../src';
import { findCdp, findRandomCdpCreator } from './queries/cdp-queries';
import { findIAsset } from './queries/iasset-queries';
import { findPriceOracle } from './queries/price-oracle-queries';
import { match, P } from 'ts-pattern';
import { findInterestOracle } from './queries/interest-oracle-queries';
import { findRandomCollector } from './queries/collector-queries';
import { findGov } from './queries/governance-queries';
import { findRandomTreasuryUtxo } from './queries/treasury-queries';
import { getValueChangeAtAddressAfterAction } from './utils';

type MyContext = LucidContext<{
  admin: EmulatorAccount;
  user: EmulatorAccount;
}>;

async function findAllNecessaryOrefs(
  context: MyContext,
  sysParams: SystemParams,
  asset: string,
): Promise<{
  iasset: IAssetOutput;
  cdpCreatorOref: OutRef;
  priceOracleOref: OutRef;
  interestOracleOref: OutRef;
  collectorOref: OutRef;
  govOref: OutRef;
  treasuryOref: OutRef;
}> {
  const iasset = await findIAsset(
    context.lucid,
    sysParams.validatorHashes.cdpHash,
    fromSystemParamsAsset(sysParams.cdpParams.iAssetAuthToken),
    asset,
  );

  return {
    iasset,
    cdpCreatorOref: await findRandomCdpCreator(
      context.lucid,
      sysParams.validatorHashes.cdpCreatorHash,
      fromSystemParamsAsset(sysParams.cdpCreatorParams.cdpCreatorNft),
    ),
    priceOracleOref: await findPriceOracle(
      context.lucid,
      match(iasset.datum.price)
        .with({ Oracle: { content: P.select() } }, (oracleNft) => oracleNft)
        .otherwise(() => {
          throw new Error('Expected active oracle');
        }),
    ),
    interestOracleOref: await findInterestOracle(
      context.lucid,
      iasset.datum.interestOracleNft,
    ),
    collectorOref: await findRandomCollector(
      context.lucid,
      sysParams.validatorHashes.collectorHash,
    ),
    govOref: (
      await findGov(
        context.lucid,
        sysParams.validatorHashes.govHash,
        fromSystemParamsAsset(sysParams.govParams.govNFT),
      )
    ).utxo,
    treasuryOref: await findRandomTreasuryUtxo(
      context.lucid,
      sysParams.validatorHashes.treasuryHash,
    ),
  };
}

describe('CDP', () => {
  beforeEach<MyContext>(async (context: MyContext) => {
    context.users = {
      admin: generateEmulatorAccount({
        lovelace: BigInt(100_000_000_000_000),
      }),
      user: generateEmulatorAccount(addAssets(mkLovelacesOf(100_000_000n))),
    };

    context.emulator = new Emulator([context.users.admin, context.users.user]);
    context.lucid = await Lucid(context.emulator, 'Custom');
  });

  test<MyContext>('Open CDP', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const sysParams = await init(context.lucid);

    const asset = 'iUSD';

    const orefs = await findAllNecessaryOrefs(context, sysParams, asset);

    await runAndAwaitTx(
      context.lucid,
      openCdp(
        10_000_000n,
        500_000n,
        sysParams,
        orefs.cdpCreatorOref,
        orefs.iasset.utxo,
        orefs.priceOracleOref,
        orefs.interestOracleOref,
        orefs.collectorOref,
        context.lucid,
        context.emulator.slot,
      ),
    );
  });

  test<MyContext>('Deposit CDP', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [pkh, skh] = await addrDetails(context.lucid);

    const sysParams = await init(context.lucid);

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
          orefs.cdpCreatorOref,
          orefs.iasset.utxo,
          orefs.priceOracleOref,
          orefs.interestOracleOref,
          orefs.collectorOref,
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
              orefs.priceOracleOref,
              orefs.interestOracleOref,
              orefs.collectorOref,
              orefs.govOref,
              orefs.treasuryOref,
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

    const sysParams = await init(context.lucid);

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
          orefs.cdpCreatorOref,
          orefs.iasset.utxo,
          orefs.priceOracleOref,
          orefs.interestOracleOref,
          orefs.collectorOref,
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
              orefs.priceOracleOref,
              orefs.interestOracleOref,
              orefs.collectorOref,
              orefs.govOref,
              orefs.treasuryOref,
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

    const sysParams = await init(context.lucid);

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
          orefs.cdpCreatorOref,
          orefs.iasset.utxo,
          orefs.priceOracleOref,
          orefs.interestOracleOref,
          orefs.collectorOref,
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
              orefs.priceOracleOref,
              orefs.interestOracleOref,
              orefs.collectorOref,
              orefs.govOref,
              orefs.treasuryOref,
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

    const sysParams = await init(context.lucid);

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
          orefs.cdpCreatorOref,
          orefs.iasset.utxo,
          orefs.priceOracleOref,
          orefs.interestOracleOref,
          orefs.collectorOref,
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
              orefs.priceOracleOref,
              orefs.interestOracleOref,
              orefs.collectorOref,
              orefs.govOref,
              orefs.treasuryOref,
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

    const sysParams = await init(context.lucid);

    const asset = 'iUSD';

    {
      const orefs = await findAllNecessaryOrefs(context, sysParams, asset);

      await runAndAwaitTx(
        context.lucid,
        openCdp(
          10_000_000n,
          500_000n,
          sysParams,
          orefs.cdpCreatorOref,
          orefs.iasset.utxo,
          orefs.priceOracleOref,
          orefs.interestOracleOref,
          orefs.collectorOref,
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
          orefs.priceOracleOref,
          orefs.interestOracleOref,
          orefs.collectorOref,
          orefs.govOref,
          orefs.treasuryOref,
          sysParams,
          context.lucid,
          context.emulator.slot,
        ),
      );
    }
  });
});
