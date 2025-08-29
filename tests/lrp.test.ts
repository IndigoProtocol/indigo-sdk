import { assert, describe, it, test } from 'vitest';
import {
  Emulator,
  fromText,
  generateEmulatorAccount,
  Lucid,
  LucidEvolution,
  Network,
  paymentCredentialOf,
  validatorToScriptHash,
} from '@lucid-evolution/lucid';
import { LRPParams } from '../src/types/indigo/lrp';
import { mkLrpValidator } from '../src/scripts/lrp-validator';
import { runCreateScriptRefTx } from '../src/helpers/helper-txs';
import { runOneShotMintTx } from '../src/contracts/one-shot';
import { cancelLrp, openLrp, redeemLrp } from '../src/contracts/lrp';
import { findLrp } from './queries/lrp-queries';
import { addrDetails } from '../src/helpers/lucid-utils';
import { runAndAwaitTx } from './test-helpers';
import { matchSingle } from '../src/helpers/helpers';
import { runCreateIAsset, runStartPriceOracle } from './indigo-test-helpers';
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
import { assetClassValueOf } from '../src/helpers/value-helpers';

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
  const oracleNft = await runStartPriceOracle(
    lucid,
    oracleValidatorHash,
    priceOracleParams,
    network,
    fromText('ORACLE_IBTC'),
    iassetPrice,
  );

  const iassetValHash = validatorToScriptHash(alwaysFailValidator);
  const iassetNft = await runCreateIAsset(lucid, network, iassetValHash, {
    assetName: iassetTokenName,
    price: { Oracle: oracleNft },
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
  it('case 1', async () => {
    const network: Network = 'Custom';
    const account1 = generateEmulatorAccount({
      lovelace: 80_000_000_000n, // 80,000 ADA
    });

    const emulator = new Emulator([account1]);
    const lucid = await Lucid(emulator, network);

    lucid.selectWallet.fromSeed(account1.seedPhrase);

    const iassetTokenName = fromText('TEST_IBTC');
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

    const lrpUtxo = matchSingle(
      await findLrp(
        lucid,
        network,
        lrpValidatorHash,
        ownPkh.hash,
        iassetTokenName,
      ),
      (res) => new Error('Expected a single LRP UTXO.: ' + JSON.stringify(res)),
    );

    assert(
      assetClassValueOf(lrpUtxo.assets, {
        currencySymbol: testCtx.iassetAc.currencySymbol,
        tokenName: iassetTokenName,
      }) === 0n,
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
          network,
          testCtx.iassetValHash,
          testCtx.iassetNft,
          iassetTokenName,
        ),
        lucid,
        lrpParams,
        testCtx.oracleParams,
        network,
        emulator.slot,
      ),
    );

    const resultLrp = matchSingle(
      await findLrp(
        lucid,
        network,
        lrpValidatorHash,
        ownPkh.hash,
        iassetTokenName,
      ),
      (res) => new Error('Expected a single LRP UTXO.: ' + JSON.stringify(res)),
    );

    assert(
      assetClassValueOf(resultLrp.assets, {
        currencySymbol: testCtx.iassetAc.currencySymbol,
        tokenName: iassetTokenName,
      }) === redemptionIAssetAmt,
      'LRP has wrong number of iassets after redemption',
    );

    await runAndAwaitTx(lucid, cancelLrp(resultLrp, lrpRefScriptOutRef, lucid));
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
          network,
          testCtx.iassetValHash,
          testCtx.iassetNft,
          iassetTokenName,
        ),
        lucid,
        lrpParams,
        testCtx.oracleParams,
        network,
        emulator.slot,
      ),
    );

    // const resultLrpUtxo1 = matchSingle(
    //   await findLrp(
    //     lucid,
    //     network,
    //     lrpValidatorHash,
    //     paymentCredentialOf(account1.address).hash,
    //     iassetTokenName,
    //   ),
    //   (res) => new Error('Expected a single LRP UTXO.: ' + JSON.stringify(res)),
    // );
    // const resultLrpUtxo2 = matchSingle(
    //   await findLrp(
    //     lucid,
    //     network,
    //     lrpValidatorHash,
    //     paymentCredentialOf(account2.address).hash,
    //     iassetTokenName,
    //   ),
    //   (res) => new Error('Expected a single LRP UTXO.: ' + JSON.stringify(res)),
    // );

    // assert(
    //   assetClassValueOf(resultLrpUtxo1.assets, {
    //     currencySymbol: testCtx.iassetAc.currencySymbol,
    //     tokenName: iassetTokenName,
    //   }) === 5_000_000n,
    //   'LRP1 has wrong number of iassets after redemption',
    // );
    // assert(
    //   assetClassValueOf(resultLrpUtxo2.assets, {
    //     currencySymbol: testCtx.iassetAc.currencySymbol,
    //     tokenName: iassetTokenName,
    //   }) === 4_000_000n,
    //   'LRP2 has wrong number of iassets after redemption',
    // );
  });
});
