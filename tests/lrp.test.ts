import { assert, describe, expect, it } from 'vitest';
import {
  Emulator,
  fromText,
  generateEmulatorAccount,
  Lucid,
  LucidEvolution,
  Network,
  paymentCredentialOf,
  toText,
  UTxO,
  validatorToScriptHash,
} from '@lucid-evolution/lucid';
import { LRPParams, parseLrpDatum } from '../src/types/indigo/lrp';
import { mkLrpValidator } from '../src/scripts/lrp-validator';
import { runCreateScriptRefTx } from '../src/helpers/helper-txs';
import { runOneShotMintTx } from '../src/contracts/one-shot';
import {
  adjustLrp,
  cancelLrp,
  claimLrp,
  openLrp,
  redeemLrp,
} from '../src/contracts/lrp';
import { findLrp } from './queries/lrp-queries';
import { addrDetails, getInlineDatumOrThrow } from '../src/helpers/lucid-utils';
import { runAndAwaitTx, runAndAwaitTxBuilder } from './test-helpers';
import { matchSingle } from '../src/helpers/helpers';
import { runCreateIAsset } from './indigo-test-helpers';
import { mkPriceOracleValidator } from '../src/scripts/price-oracle-validator';
import { AssetClass, OracleAssetNft, PriceOracleParams } from '../src';
import { alwaysFailValidator } from '../src/scripts/always-fail-validator';
import {
  OCD_ONE,
  OCD_ZERO,
  OnChainDecimal,
} from '../src/types/on-chain-decimal';
import { findPriceOracle } from './queries/price-oracle-queries';
import { findIAsset } from './queries/iasset-queries';
import { assetClassValueOf, lovelacesAmt } from '../src/helpers/value-helpers';
import { strictEqual } from 'assert';
import { startPriceOracleTx } from '../src/contracts/price-oracle';

type LRPTestContext = {
  iassetAc: AssetClass;
  oracleNft: OracleAssetNft;
  iassetNft: AssetClass;
  iassetValHash: string;
  oracleParams: PriceOracleParams;
  oracleValHash: string;
};

async function initTest(
  /** The admin account lucid instance */
  lucid: LucidEvolution,
  network: Network,
  iassetTokenName: string,
  initialMint: bigint,
  iassetPrice: OnChainDecimal,
): Promise<LRPTestContext> {
  const utxos = await lucid.wallet().getUtxos();
  const iassetPolicyId = await runOneShotMintTx(lucid, {
    referenceOutRef: {
      txHash: utxos[0].txHash,
      outputIdx: BigInt(utxos[0].outputIndex),
    },
    mintAmounts: [{ tokenName: iassetTokenName, amount: initialMint }],
  });

  const [ownPkh, _] = await addrDetails(lucid);

  const priceOracleParams: PriceOracleParams = {
    owner: ownPkh.hash,
    // 1 minute
    biasTime: 1n * 60n * 1000n,
    // 10 minutes
    expiration: 10n * 60n * 1000n,
  };
  const oracleValidator = mkPriceOracleValidator(priceOracleParams);
  const oracleValidatorHash = validatorToScriptHash(oracleValidator);
  const [tx, oracleNft] = await startPriceOracleTx(
    lucid,
    'ORACLE_IBTC',
    iassetPrice,
    priceOracleParams,
  );

  await runAndAwaitTxBuilder(lucid, tx);

  const iassetValHash = validatorToScriptHash(alwaysFailValidator);
  const iassetNft = await runCreateIAsset(lucid, network, iassetValHash, {
    assetName: iassetTokenName,
    price: { Oracle: { content: oracleNft } },
    interestOracleNft: { currencySymbol: '', tokenName: '' },
    redemptionRatio: OCD_ONE,
    maintenanceRatio: OCD_ONE,
    liquidationRatio: OCD_ONE,
    debtMintingFeePercentage: OCD_ZERO,
    liquidationProcessingFeePercentage: OCD_ZERO,
    stabilityPoolWithdrawalFeePercentage: OCD_ZERO,
    redemptionReimbursementPercentage: OCD_ONE,
    redemptionProcessingFeePercentage: OCD_ZERO,
    interestCollectorPortionPercentage: OCD_ZERO,
    firstIAsset: true,
    nextIAsset: null,
  });

  return {
    oracleNft: oracleNft,
    iassetAc: { currencySymbol: iassetPolicyId, tokenName: iassetTokenName },
    iassetNft: iassetNft,
    iassetValHash: iassetValHash,
    oracleParams: priceOracleParams,
    oracleValHash: oracleValidatorHash,
  };
}

describe('LRP', () => {
  it('adjust positive and negative', async () => {
    const network: Network = 'Custom';
    const account1 = generateEmulatorAccount({
      lovelace: 80_000_000_000n, // 80,000 ADA
    });

    const emulator = new Emulator([account1]);
    const lucid = await Lucid(emulator, network);

    lucid.selectWallet.fromSeed(account1.seedPhrase);

    const iassetTokenName = fromText('iBTC');
    const testCtx = await initTest(
      lucid,
      network,
      iassetTokenName,
      10_000_000n,
      OCD_ONE,
    );

    const [ownPkh, _] = await addrDetails(lucid);

    const lrpParams: LRPParams = {
      versionRecordToken: {
        currencySymbol: fromText('smth'),
        tokenName: fromText('version_record'),
      },
      iassetNft: testCtx.iassetNft,
      iassetPolicyId: testCtx.iassetAc.currencySymbol,
      minRedemptionLovelacesAmt: 1_000_000n,
    };

    const lrpValidator = mkLrpValidator(lrpParams);
    const lrpValidatorHash = validatorToScriptHash(lrpValidator);
    const lrpRefScriptOutRef = await runCreateScriptRefTx(
      lucid,
      lrpValidator,
      network,
    );

    const findSingleOwnLrp = async (): Promise<UTxO> => {
      return matchSingle(
        await findLrp(
          lucid,
          network,
          lrpValidatorHash,
          ownPkh.hash,
          iassetTokenName,
        ),
        (res) =>
          new Error('Expected a single LRP UTXO.: ' + JSON.stringify(res)),
      );
    };

    await runAndAwaitTx(
      lucid,
      openLrp(
        iassetTokenName,
        20_000_000n,
        { getOnChainInt: 1_000_000n },
        lucid,
        lrpValidatorHash,
        network,
      ),
    );

    await runAndAwaitTx(
      lucid,
      findSingleOwnLrp().then((lrp) =>
        adjustLrp(lucid, lrp, -1_000_000n, lrpRefScriptOutRef, lrpParams),
      ),
    );

    const adjustedUtxo1 = await findSingleOwnLrp();

    assert(
      parseLrpDatum(getInlineDatumOrThrow(adjustedUtxo1)).lovelacesToSpend ===
        20_000_000n - 1_000_000n,
    );

    expect(
      lovelacesAmt(adjustedUtxo1.assets) >=
        parseLrpDatum(getInlineDatumOrThrow(adjustedUtxo1)).lovelacesToSpend,
      'Lovelaces to spend has to be smaller than actual lovelaces in UTXO',
    );

    await runAndAwaitTx(
      lucid,
      adjustLrp(
        lucid,
        adjustedUtxo1,
        5_000_000n,
        lrpRefScriptOutRef,
        lrpParams,
      ),
    );

    const adjustedUtxo2 = matchSingle(
      await findLrp(
        lucid,
        network,
        lrpValidatorHash,
        ownPkh.hash,
        iassetTokenName,
      ),
      (res) => new Error('Expected a single LRP UTXO.: ' + JSON.stringify(res)),
    );

    const expectedResultAdaAmt = 20_000_000n - 1_000_000n + 5_000_000n;

    strictEqual(
      parseLrpDatum(getInlineDatumOrThrow(adjustedUtxo2)).lovelacesToSpend,
      expectedResultAdaAmt,
    );

    expect(
      lovelacesAmt(adjustedUtxo2.assets) >=
        parseLrpDatum(getInlineDatumOrThrow(adjustedUtxo2)).lovelacesToSpend,
      'Lovelaces to spend has to be smaller than actual lovelaces in UTXO',
    );
  });

  it('claim', async () => {
    const network: Network = 'Custom';
    const account1 = generateEmulatorAccount({
      lovelace: 80_000_000_000n, // 80,000 ADA
    });

    const emulator = new Emulator([account1]);
    const lucid = await Lucid(emulator, network);

    lucid.selectWallet.fromSeed(account1.seedPhrase);

    const iassetTokenName = fromText('iBTC');
    const testCtx = await initTest(
      lucid,
      network,
      iassetTokenName,
      10_000_000n,
      OCD_ONE,
    );

    const [ownPkh, _] = await addrDetails(lucid);

    const lrpParams: LRPParams = {
      versionRecordToken: {
        currencySymbol: fromText('smth'),
        tokenName: fromText('version_record'),
      },
      iassetNft: testCtx.iassetNft,
      iassetPolicyId: testCtx.iassetAc.currencySymbol,
      minRedemptionLovelacesAmt: 1_000_000n,
    };

    const lrpValidator = mkLrpValidator(lrpParams);
    const lrpValidatorHash = validatorToScriptHash(lrpValidator);
    const lrpRefScriptOutRef = await runCreateScriptRefTx(
      lucid,
      lrpValidator,
      network,
    );

    const findSingleOwnLrp = async (): Promise<UTxO> => {
      return matchSingle(
        await findLrp(
          lucid,
          network,
          lrpValidatorHash,
          ownPkh.hash,
          iassetTokenName,
        ),
        (res) =>
          new Error('Expected a single LRP UTXO.: ' + JSON.stringify(res)),
      );
    };

    await runAndAwaitTx(
      lucid,
      openLrp(
        iassetTokenName,
        20_000_000n,
        { getOnChainInt: 1_000_000n },
        lucid,
        lrpValidatorHash,
        network,
      ),
    );

    const lrpUtxo = await findSingleOwnLrp();

    const redemptionAsset: AssetClass = {
      currencySymbol: testCtx.iassetAc.currencySymbol,
      tokenName: iassetTokenName,
    };

    strictEqual(
      assetClassValueOf(lrpUtxo.assets, redemptionAsset),
      0n,
      'LRP should have no iassets before redemption',
    );

    const redemptionIAssetAmt = 5_000_000n;

    await runAndAwaitTx(
      lucid,
      redeemLrp(
        [[lrpUtxo, redemptionIAssetAmt]],
        lrpRefScriptOutRef,
        await findPriceOracle(
          lucid,
          network,
          testCtx.oracleValHash,
          testCtx.oracleNft,
        ),
        await findIAsset(
          lucid,
          testCtx.iassetValHash,
          testCtx.iassetNft,
          toText(iassetTokenName),
        ),
        lucid,
        lrpParams,
        network,
      ),
    );

    const redeemedLrp = await findSingleOwnLrp();

    strictEqual(
      assetClassValueOf(redeemedLrp.assets, redemptionAsset),
      redemptionIAssetAmt,
      'LRP has wrong number of iassets after redemption',
    );

    await runAndAwaitTx(
      lucid,
      claimLrp(lucid, redeemedLrp, lrpRefScriptOutRef, lrpParams),
    );

    const claimedLrp = await findSingleOwnLrp();

    strictEqual(
      assetClassValueOf(claimedLrp.assets, redemptionAsset),
      0n,
      'LRP has to have 0 redemption assets after claim',
    );
  });

  it('claim using adjust', async () => {
    const network: Network = 'Custom';
    const account1 = generateEmulatorAccount({
      lovelace: 80_000_000_000n, // 80,000 ADA
    });

    const emulator = new Emulator([account1]);
    const lucid = await Lucid(emulator, network);

    lucid.selectWallet.fromSeed(account1.seedPhrase);

    const iassetTokenName = fromText('iBTC');
    const testCtx = await initTest(
      lucid,
      network,
      iassetTokenName,
      10_000_000n,
      OCD_ONE,
    );

    const [ownPkh, _] = await addrDetails(lucid);

    const lrpParams: LRPParams = {
      versionRecordToken: {
        currencySymbol: fromText('smth'),
        tokenName: fromText('version_record'),
      },
      iassetNft: testCtx.iassetNft,
      iassetPolicyId: testCtx.iassetAc.currencySymbol,
      minRedemptionLovelacesAmt: 1_000_000n,
    };

    const lrpValidator = mkLrpValidator(lrpParams);
    const lrpValidatorHash = validatorToScriptHash(lrpValidator);
    const lrpRefScriptOutRef = await runCreateScriptRefTx(
      lucid,
      lrpValidator,
      network,
    );

    const findSingleOwnLrp = async (): Promise<UTxO> => {
      return matchSingle(
        await findLrp(
          lucid,
          network,
          lrpValidatorHash,
          ownPkh.hash,
          iassetTokenName,
        ),
        (res) =>
          new Error('Expected a single LRP UTXO.: ' + JSON.stringify(res)),
      );
    };

    await runAndAwaitTx(
      lucid,
      openLrp(
        iassetTokenName,
        20_000_000n,
        { getOnChainInt: 1_000_000n },
        lucid,
        lrpValidatorHash,
        network,
      ),
    );

    const lrpUtxo = await findSingleOwnLrp();

    const redemptionAsset: AssetClass = {
      currencySymbol: testCtx.iassetAc.currencySymbol,
      tokenName: iassetTokenName,
    };

    strictEqual(
      assetClassValueOf(lrpUtxo.assets, redemptionAsset),
      0n,
      'LRP should have no iassets before redemption',
    );

    const redemptionIAssetAmt = 5_000_000n;

    await runAndAwaitTx(
      lucid,
      redeemLrp(
        [[lrpUtxo, redemptionIAssetAmt]],
        lrpRefScriptOutRef,
        await findPriceOracle(
          lucid,
          network,
          testCtx.oracleValHash,
          testCtx.oracleNft,
        ),
        await findIAsset(
          lucid,
          testCtx.iassetValHash,
          testCtx.iassetNft,
          toText(iassetTokenName),
        ),
        lucid,
        lrpParams,
        network,
      ),
    );

    const redeemedLrp = await findSingleOwnLrp();

    strictEqual(
      assetClassValueOf(redeemedLrp.assets, redemptionAsset),
      redemptionIAssetAmt,
      'LRP has wrong number of iassets after redemption',
    );

    await runAndAwaitTx(
      lucid,
      adjustLrp(lucid, redeemedLrp, -1_000_000n, lrpRefScriptOutRef, lrpParams),
    );

    const adjustedLrp = await findSingleOwnLrp();

    strictEqual(
      assetClassValueOf(adjustedLrp.assets, redemptionAsset),
      0n,
      'LRP has to have 0 redemption assets after adjust',
    );

    strictEqual(
      parseLrpDatum(getInlineDatumOrThrow(adjustedLrp)).lovelacesToSpend,
      // 20mil start, 5mil redeemer at price 1:1, -1mil adjusted
      14_000_000n,
    );
  });

  it('single redemption and cancel', async () => {
    const network: Network = 'Custom';
    const account1 = generateEmulatorAccount({
      lovelace: 80_000_000_000n, // 80,000 ADA
    });

    const emulator = new Emulator([account1]);
    const lucid = await Lucid(emulator, network);

    lucid.selectWallet.fromSeed(account1.seedPhrase);

    const iassetTokenName = fromText('iBTC');
    const testCtx = await initTest(
      lucid,
      network,
      iassetTokenName,
      10_000_000n,
      OCD_ONE,
    );

    const [ownPkh, _] = await addrDetails(lucid);

    const lrpParams: LRPParams = {
      versionRecordToken: {
        currencySymbol: fromText('smth'),
        tokenName: fromText('version_record'),
      },
      iassetNft: testCtx.iassetNft,
      iassetPolicyId: testCtx.iassetAc.currencySymbol,
      minRedemptionLovelacesAmt: 1_000_000n,
    };

    const lrpValidator = mkLrpValidator(lrpParams);
    const lrpValidatorHash = validatorToScriptHash(lrpValidator);
    const lrpRefScriptOutRef = await runCreateScriptRefTx(
      lucid,
      lrpValidator,
      network,
    );

    const findSingleOwnLrp = async (): Promise<UTxO> => {
      return matchSingle(
        await findLrp(
          lucid,
          network,
          lrpValidatorHash,
          ownPkh.hash,
          iassetTokenName,
        ),
        (res) =>
          new Error('Expected a single LRP UTXO.: ' + JSON.stringify(res)),
      );
    };

    await runAndAwaitTx(
      lucid,
      openLrp(
        iassetTokenName,
        20_000_000n,
        { getOnChainInt: 1_000_000n },
        lucid,
        lrpValidatorHash,
        network,
      ),
    );

    const lrpUtxo = await findSingleOwnLrp();

    const redemptionAsset: AssetClass = {
      currencySymbol: testCtx.iassetAc.currencySymbol,
      tokenName: iassetTokenName,
    };

    strictEqual(
      assetClassValueOf(lrpUtxo.assets, redemptionAsset),
      0n,
      'LRP should have no iassets before redemption',
    );

    const redemptionIAssetAmt = 5_000_000n;

    await runAndAwaitTx(
      lucid,
      redeemLrp(
        [[lrpUtxo, redemptionIAssetAmt]],
        lrpRefScriptOutRef,
        await findPriceOracle(
          lucid,
          network,
          testCtx.oracleValHash,
          testCtx.oracleNft,
        ),
        await findIAsset(
          lucid,
          testCtx.iassetValHash,
          testCtx.iassetNft,
          toText(iassetTokenName),
        ),
        lucid,
        lrpParams,
        network,
      ),
    );

    const redeemedLrp = await findSingleOwnLrp();

    strictEqual(
      assetClassValueOf(redeemedLrp.assets, redemptionAsset),
      redemptionIAssetAmt,
      'LRP has wrong number of iassets after redemption',
    );

    await runAndAwaitTx(
      lucid,
      cancelLrp(redeemedLrp, lrpRefScriptOutRef, lucid),
    );
  });

  it('multi redemption case', async () => {
    const network: Network = 'Custom';
    const account1 = generateEmulatorAccount({
      lovelace: 80_000_000_000n, // 80,000 ADA
    });
    const account2 = generateEmulatorAccount({
      lovelace: 80_000_000_000n, // 80,000 ADA
    });

    const emulator = new Emulator([account1, account2]);
    const lucid = await Lucid(emulator, network);

    lucid.selectWallet.fromSeed(account1.seedPhrase);

    const iassetTokenName = fromText('TEST_IBTC');
    const testCtx = await initTest(
      lucid,
      network,
      iassetTokenName,
      100_000_000n,
      OCD_ONE,
    );

    const lrpParams: LRPParams = {
      versionRecordToken: {
        currencySymbol: fromText('smth'),
        tokenName: fromText('version_record'),
      },
      iassetNft: testCtx.iassetNft,
      iassetPolicyId: testCtx.iassetAc.currencySymbol,
      minRedemptionLovelacesAmt: 1_000_000n,
    };

    const lrpValidator = mkLrpValidator(lrpParams);
    const lrpValidatorHash = validatorToScriptHash(lrpValidator);
    const lrpRefScriptOutRef = await runCreateScriptRefTx(
      lucid,
      lrpValidator,
      network,
    );

    await runAndAwaitTx(
      lucid,
      openLrp(
        iassetTokenName,
        20_000_000n,
        { getOnChainInt: 1_000_000n },
        lucid,
        lrpValidatorHash,
        network,
      ),
    );

    lucid.selectWallet.fromSeed(account2.seedPhrase);

    await runAndAwaitTx(
      lucid,
      openLrp(
        iassetTokenName,
        20_000_000n,
        { getOnChainInt: 1_100_000n },
        lucid,
        lrpValidatorHash,
        network,
      ),
    );

    const lrpUtxo2 = matchSingle(
      await findLrp(
        lucid,
        network,
        lrpValidatorHash,
        await addrDetails(lucid).then((d) => d[0].hash),
        iassetTokenName,
      ),
      (res) => new Error('Expected a single LRP UTXO.: ' + JSON.stringify(res)),
    );

    lucid.selectWallet.fromSeed(account1.seedPhrase);

    const lrpUtxo1 = matchSingle(
      await findLrp(
        lucid,
        network,
        lrpValidatorHash,
        await addrDetails(lucid).then((d) => d[0].hash),
        iassetTokenName,
      ),
      (res) => new Error('Expected a single LRP UTXO.: ' + JSON.stringify(res)),
    );

    await runAndAwaitTx(
      lucid,
      redeemLrp(
        [
          [lrpUtxo1, 5_000_000n],
          [lrpUtxo2, 4_000_000n],
        ],
        lrpRefScriptOutRef,
        await findPriceOracle(
          lucid,
          network,
          testCtx.oracleValHash,
          testCtx.oracleNft,
        ),
        await findIAsset(
          lucid,
          testCtx.iassetValHash,
          testCtx.iassetNft,
          toText(iassetTokenName),
        ),
        lucid,
        lrpParams,
        network,
      ),
    );

    const resultLrpUtxo1 = matchSingle(
      await findLrp(
        lucid,
        network,
        lrpValidatorHash,
        paymentCredentialOf(account1.address).hash,
        iassetTokenName,
      ),
      (res) => new Error('Expected a single LRP UTXO.: ' + JSON.stringify(res)),
    );
    const resultLrpUtxo2 = matchSingle(
      await findLrp(
        lucid,
        network,
        lrpValidatorHash,
        paymentCredentialOf(account2.address).hash,
        iassetTokenName,
      ),
      (res) => new Error('Expected a single LRP UTXO.: ' + JSON.stringify(res)),
    );

    assert(
      assetClassValueOf(resultLrpUtxo1.assets, {
        currencySymbol: testCtx.iassetAc.currencySymbol,
        tokenName: iassetTokenName,
      }) === 5_000_000n,
      'LRP1 has wrong number of iassets after redemption',
    );
    assert(
      assetClassValueOf(resultLrpUtxo2.assets, {
        currencySymbol: testCtx.iassetAc.currencySymbol,
        tokenName: iassetTokenName,
      }) === 4_000_000n,
      'LRP2 has wrong number of iassets after redemption',
    );
  });
});
