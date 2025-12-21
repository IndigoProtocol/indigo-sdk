import { assert, beforeEach, describe, expect, test } from 'vitest';
import {
  addAssets,
  Credential,
  Emulator,
  EmulatorAccount,
  fromText,
  generateEmulatorAccount,
  Lucid,
  paymentCredentialOf,
  toText,
  UTxO,
} from '@lucid-evolution/lucid';
import { parseLrpDatumOrThrow } from '../src/contracts/lrp/types';
import {
  adjustLrp,
  cancelLrp,
  claimLrp,
  openLrp,
  redeemLrp,
} from '../src/contracts/lrp/transactions';
import { findLrp } from './queries/lrp-queries';
import { addrDetails, getInlineDatumOrThrow } from '../src/utils/lucid-utils';
import { LucidContext, runAndAwaitTx } from './test-helpers';
import { matchSingle } from '../src/utils/utils';
import { AssetClass, openCdp, SystemParams } from '../src';
import {
  assetClassValueOf,
  lovelacesAmt,
  mkLovelacesOf,
} from '../src/utils/value-helpers';
import { strictEqual } from 'assert';
import { init } from './endpoints/initialize';
import { iusdInitialAssetCfg } from './mock/assets-mock';
import { findAllNecessaryOrefs } from './queries/cdp-queries';

type MyContext = LucidContext<{
  admin: EmulatorAccount;
  user: EmulatorAccount;
}>;

async function findSingleLrp(
  context: MyContext,
  sysParams: SystemParams,
  iasset: string,
  pkh: Credential,
): Promise<UTxO> {
  return matchSingle(
    await findLrp(
      context.lucid,
      sysParams.validatorHashes.lrpHash,
      pkh.hash,
      iasset,
    ),
    (res) => new Error('Expected a single LRP UTXO.: ' + JSON.stringify(res)),
  );
}

describe('LRP', () => {
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

  test<MyContext>('adjust positive and negative', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, __] = await init(context.lucid, [iusdInitialAssetCfg]);

    const iasset = fromText(iusdInitialAssetCfg.name);

    const [ownPkh, _] = await addrDetails(context.lucid);

    await runAndAwaitTx(
      context.lucid,
      openLrp(
        iasset,
        20_000_000n,
        { getOnChainInt: 1_000_000n },
        context.lucid,
        sysParams,
      ),
    );

    await runAndAwaitTx(
      context.lucid,
      findSingleLrp(context, sysParams, iasset, ownPkh).then((lrp) =>
        adjustLrp(context.lucid, lrp, -1_000_000n, sysParams),
      ),
    );

    const adjustedUtxo1 = await findSingleLrp(
      context,
      sysParams,
      iasset,
      ownPkh,
    );

    assert(
      parseLrpDatumOrThrow(getInlineDatumOrThrow(adjustedUtxo1))
        .lovelacesToSpend ===
        20_000_000n - 1_000_000n,
    );

    expect(
      lovelacesAmt(adjustedUtxo1.assets) >=
        parseLrpDatumOrThrow(getInlineDatumOrThrow(adjustedUtxo1))
          .lovelacesToSpend,
      'Lovelaces to spend has to be smaller than actual lovelaces in UTXO',
    ).toBeTruthy();

    await runAndAwaitTx(
      context.lucid,
      adjustLrp(context.lucid, adjustedUtxo1, 5_000_000n, sysParams),
    );

    const adjustedUtxo2 = await findSingleLrp(
      context,
      sysParams,
      iasset,
      ownPkh,
    );

    const expectedResultAdaAmt = 20_000_000n - 1_000_000n + 5_000_000n;

    strictEqual(
      parseLrpDatumOrThrow(getInlineDatumOrThrow(adjustedUtxo2))
        .lovelacesToSpend,
      expectedResultAdaAmt,
    );

    expect(
      lovelacesAmt(adjustedUtxo2.assets) >=
        parseLrpDatumOrThrow(getInlineDatumOrThrow(adjustedUtxo2))
          .lovelacesToSpend,
      'Lovelaces to spend has to be smaller than actual lovelaces in UTXO',
    ).toBeTruthy();
  });

  test<MyContext>('claim', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, __] = await init(context.lucid, [iusdInitialAssetCfg]);

    const iasset = fromText(iusdInitialAssetCfg.name);

    const [ownPkh, _] = await addrDetails(context.lucid);

    {
      const orefs = await findAllNecessaryOrefs(
        context.lucid,
        sysParams,
        toText(iasset),
      );

      await runAndAwaitTx(
        context.lucid,
        openCdp(
          100_000_000n,
          30_000_000n,
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

    await runAndAwaitTx(
      context.lucid,
      openLrp(
        iasset,
        20_000_000n,
        { getOnChainInt: 1_000_000n },
        context.lucid,
        sysParams,
      ),
    );

    const lrpUtxo = await findSingleLrp(context, sysParams, iasset, ownPkh);

    const redemptionAsset: AssetClass = {
      currencySymbol: sysParams.lrpParams.iassetPolicyId.unCurrencySymbol,
      tokenName: iasset,
    };

    expect(
      assetClassValueOf(lrpUtxo.assets, redemptionAsset),
      'LRP should have no iassets before redemption',
    ).toBe(0n);

    const redemptionIAssetAmt = 11_000_000n;

    {
      const orefs = await findAllNecessaryOrefs(
        context.lucid,
        sysParams,
        toText(iasset),
      );

      await runAndAwaitTx(
        context.lucid,
        redeemLrp(
          [[lrpUtxo, redemptionIAssetAmt]],
          orefs.priceOracleUtxo,
          orefs.iasset.utxo,
          context.lucid,
          sysParams,
        ),
      );
    }

    const redeemedLrp = await findSingleLrp(context, sysParams, iasset, ownPkh);

    expect(
      assetClassValueOf(redeemedLrp.assets, redemptionAsset),
      'LRP has wrong number of iassets after redemption',
    ).toBe(redemptionIAssetAmt);

    await runAndAwaitTx(
      context.lucid,
      claimLrp(context.lucid, redeemedLrp, sysParams),
    );

    const claimedLrp = await findSingleLrp(context, sysParams, iasset, ownPkh);

    expect(
      assetClassValueOf(claimedLrp.assets, redemptionAsset),
      'LRP has to have 0 redemption assets after claim',
    ).toBe(0n);
  });

  test<MyContext>('claim using adjust', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, __] = await init(context.lucid, [iusdInitialAssetCfg]);

    const iasset = fromText(iusdInitialAssetCfg.name);

    const [ownPkh, _] = await addrDetails(context.lucid);

    {
      const orefs = await findAllNecessaryOrefs(
        context.lucid,
        sysParams,
        toText(iasset),
      );

      await runAndAwaitTx(
        context.lucid,
        openCdp(
          100_000_000n,
          30_000_000n,
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

    await runAndAwaitTx(
      context.lucid,
      openLrp(
        iasset,
        20_000_000n,
        { getOnChainInt: 1_000_000n },
        context.lucid,
        sysParams,
      ),
    );

    const lrpUtxo = await findSingleLrp(context, sysParams, iasset, ownPkh);

    const redemptionAsset: AssetClass = {
      currencySymbol: sysParams.lrpParams.iassetPolicyId.unCurrencySymbol,
      tokenName: iasset,
    };

    expect(
      assetClassValueOf(lrpUtxo.assets, redemptionAsset),
      'LRP should have no iassets before redemption',
    ).toBe(0n);

    const redemptionIAssetAmt = 11_000_000n;

    {
      const orefs = await findAllNecessaryOrefs(
        context.lucid,
        sysParams,
        toText(iasset),
      );

      await runAndAwaitTx(
        context.lucid,
        redeemLrp(
          [[lrpUtxo, redemptionIAssetAmt]],
          orefs.priceOracleUtxo,
          orefs.iasset.utxo,
          context.lucid,
          sysParams,
        ),
      );
    }

    const redeemedLrp = await findSingleLrp(context, sysParams, iasset, ownPkh);

    expect(
      assetClassValueOf(redeemedLrp.assets, redemptionAsset),
      'LRP has wrong number of iassets after redemption',
    ).toBe(redemptionIAssetAmt);

    await runAndAwaitTx(
      context.lucid,
      adjustLrp(context.lucid, redeemedLrp, -1_000_000n, sysParams),
    );

    const adjustedLrp = await findSingleLrp(context, sysParams, iasset, ownPkh);

    expect(
      assetClassValueOf(adjustedLrp.assets, redemptionAsset),
      'LRP has to have 0 redemption assets after adjust',
    ).toBe(0n);

    strictEqual(
      parseLrpDatumOrThrow(getInlineDatumOrThrow(adjustedLrp)).lovelacesToSpend,
      // 20mil start, 11mil redeemed at price 1:1, -1mil adjusted
      8_000_000n,
    );
  });

  test<MyContext>('single redemption and cancel', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, __] = await init(context.lucid, [iusdInitialAssetCfg]);

    const iasset = fromText(iusdInitialAssetCfg.name);

    const [ownPkh, _] = await addrDetails(context.lucid);

    {
      const orefs = await findAllNecessaryOrefs(
        context.lucid,
        sysParams,
        toText(iasset),
      );

      await runAndAwaitTx(
        context.lucid,
        openCdp(
          100_000_000n,
          30_000_000n,
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

    await runAndAwaitTx(
      context.lucid,
      openLrp(
        iasset,
        20_000_000n,
        { getOnChainInt: 1_000_000n },
        context.lucid,
        sysParams,
      ),
    );

    const lrpUtxo = await findSingleLrp(context, sysParams, iasset, ownPkh);

    const redemptionAsset: AssetClass = {
      currencySymbol: sysParams.lrpParams.iassetPolicyId.unCurrencySymbol,
      tokenName: iasset,
    };

    expect(
      assetClassValueOf(lrpUtxo.assets, redemptionAsset),
      'LRP should have no iassets before redemption',
    ).toBe(0n);

    const redemptionIAssetAmt = 11_000_000n;

    {
      const orefs = await findAllNecessaryOrefs(
        context.lucid,
        sysParams,
        toText(iasset),
      );

      await runAndAwaitTx(
        context.lucid,
        redeemLrp(
          [[lrpUtxo, redemptionIAssetAmt]],
          orefs.priceOracleUtxo,
          orefs.iasset.utxo,
          context.lucid,
          sysParams,
        ),
      );
    }

    const redeemedLrp = await findSingleLrp(context, sysParams, iasset, ownPkh);

    expect(
      assetClassValueOf(redeemedLrp.assets, redemptionAsset),
      'LRP has wrong number of iassets after redemption',
    ).toBe(redemptionIAssetAmt);

    await runAndAwaitTx(
      context.lucid,
      cancelLrp(redeemedLrp, sysParams, context.lucid),
    );
  });

  test<MyContext>('redeem, redeem again and cancel', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, __] = await init(context.lucid, [iusdInitialAssetCfg]);

    const iasset = fromText(iusdInitialAssetCfg.name);

    const [ownPkh, _] = await addrDetails(context.lucid);

    {
      const orefs = await findAllNecessaryOrefs(
        context.lucid,
        sysParams,
        toText(iasset),
      );

      await runAndAwaitTx(
        context.lucid,
        openCdp(
          100_000_000n,
          30_000_000n,
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

    await runAndAwaitTx(
      context.lucid,
      openLrp(
        iasset,
        40_000_000n,
        { getOnChainInt: 1_000_000n },
        context.lucid,
        sysParams,
      ),
    );

    const lrpUtxo = await findSingleLrp(context, sysParams, iasset, ownPkh);

    const redemptionAsset: AssetClass = {
      currencySymbol: sysParams.lrpParams.iassetPolicyId.unCurrencySymbol,
      tokenName: iasset,
    };

    expect(
      assetClassValueOf(lrpUtxo.assets, redemptionAsset),
      'LRP should have no iassets before redemption',
    ).toBe(0n);

    const redemptionIAssetAmt = 11_000_000n;

    {
      const orefs = await findAllNecessaryOrefs(
        context.lucid,
        sysParams,
        toText(iasset),
      );

      await runAndAwaitTx(
        context.lucid,
        redeemLrp(
          [[lrpUtxo, redemptionIAssetAmt]],
          orefs.priceOracleUtxo,
          orefs.iasset.utxo,
          context.lucid,
          sysParams,
        ),
      );
    }

    const redeemedLrp = await findSingleLrp(context, sysParams, iasset, ownPkh);

    {
      const orefs = await findAllNecessaryOrefs(
        context.lucid,
        sysParams,
        toText(iasset),
      );

      await runAndAwaitTx(
        context.lucid,
        redeemLrp(
          [[redeemedLrp, redemptionIAssetAmt]],
          orefs.priceOracleUtxo,
          orefs.iasset.utxo,
          context.lucid,
          sysParams,
        ),
      );
    }

    const closableLrp = await findSingleLrp(context, sysParams, iasset, ownPkh);

    strictEqual(
      assetClassValueOf(closableLrp.assets, redemptionAsset),
      redemptionIAssetAmt * 2n,
      'LRP has wrong number of iassets after 2 redemptions',
    );

    expect(
      assetClassValueOf(redeemedLrp.assets, redemptionAsset),
      'LRP has wrong number of iassets after redemption',
    ).toBe(redemptionIAssetAmt);

    await runAndAwaitTx(
      context.lucid,
      cancelLrp(closableLrp, sysParams, context.lucid),
    );
  });

  test<MyContext>('multi redemption case', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, __] = await init(context.lucid, [iusdInitialAssetCfg]);

    const iasset = fromText(iusdInitialAssetCfg.name);

    {
      const orefs = await findAllNecessaryOrefs(
        context.lucid,
        sysParams,
        toText(iasset),
      );

      await runAndAwaitTx(
        context.lucid,
        openCdp(
          100_000_000n,
          30_000_000n,
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

    await runAndAwaitTx(
      context.lucid,
      openLrp(
        iasset,
        20_000_000n,
        { getOnChainInt: 1_000_000n },
        context.lucid,
        sysParams,
      ),
    );

    context.lucid.selectWallet.fromSeed(context.users.user.seedPhrase);

    await runAndAwaitTx(
      context.lucid,
      openLrp(
        iasset,
        20_000_000n,
        { getOnChainInt: 1_000_000n },
        context.lucid,
        sysParams,
      ),
    );

    const lrpUtxo1 = await findSingleLrp(
      context,
      sysParams,
      iasset,
      paymentCredentialOf(context.users.admin.address),
    );
    const lrpUtxo2 = await findSingleLrp(
      context,
      sysParams,
      iasset,
      paymentCredentialOf(context.users.user.address),
    );

    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    {
      const orefs = await findAllNecessaryOrefs(
        context.lucid,
        sysParams,
        toText(iasset),
      );

      await runAndAwaitTx(
        context.lucid,
        redeemLrp(
          [
            [lrpUtxo1, 10_000_000n],
            [lrpUtxo2, 11_000_000n],
          ],
          orefs.priceOracleUtxo,
          orefs.iasset.utxo,
          context.lucid,
          sysParams,
        ),
      );
    }

    const resultLrpUtxo1 = await findSingleLrp(
      context,
      sysParams,
      iasset,
      paymentCredentialOf(context.users.admin.address),
    );
    const resultLrpUtxo2 = await findSingleLrp(
      context,
      sysParams,
      iasset,
      paymentCredentialOf(context.users.user.address),
    );

    const redemptionAsset: AssetClass = {
      currencySymbol: sysParams.lrpParams.iassetPolicyId.unCurrencySymbol,
      tokenName: iasset,
    };

    expect(
      assetClassValueOf(resultLrpUtxo1.assets, redemptionAsset),
      'LRP1 has wrong number of iassets after redemption',
    ).toBe(10_000_000n);
    expect(
      assetClassValueOf(resultLrpUtxo2.assets, redemptionAsset),
      'LRP2 has wrong number of iassets after redemption',
    ).toBe(11_000_000n);
  });
});
