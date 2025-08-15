import { describe, it } from 'vitest';
import {
  Emulator,
  fromText,
  generateEmulatorAccount,
  Lucid,
  Network,
  validatorToScriptHash,
} from '@lucid-evolution/lucid';
import { LRPParams } from '../src/types/indigo/lrp';
import { mkLrpValidator } from '../src/scripts/lrp-validator';
import { runCreateScriptRefTx } from '../src/helpers/helper-txs';
import { runOneShotMintTx } from '../src/contracts/one-shot';
import { cancelLrp, openLrp } from '../src/contracts/lrp';
import { findLrp } from './queries/lrp-queries';
import { addrDetails } from '../src/helpers/lucid-utils';
import { runAndAwaitTx } from './test-helpers';
import { matchSingle } from '../src/helpers/helpers';
import { runCreateIAsset, runStartPriceOracle } from './indigo-test-helpers';
import { mkPriceOracleValidator } from '../src/scripts/price-oracle-validator';
import { AssetClass, PriceOracleParams } from '../src';
import { alwaysFailValidator } from '../src/scripts/always-fail-validator';
import { OCD_ONE, OCD_ZERO } from '../src/types/on-chain-decimal';

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
    const utxos = await lucid.wallet().getUtxos();
    const iassetPolicyId = await runOneShotMintTx(lucid, {
      referenceOutRef: {
        txHash: utxos[0].txHash,
        outputIdx: BigInt(utxos[0].outputIndex),
      },
      mintAmounts: [{ tokenName: iassetTokenName, amount: 10_000_000n }],
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
      OCD_ONE,
    );

    const iassetValHash = validatorToScriptHash(alwaysFailValidator);
    const dummyAc: AssetClass = { currencySymbol: '', tokenName: '' };
    const iassetNft = await runCreateIAsset(lucid, network, iassetValHash, {
      assetName: iassetTokenName,
      price: { Oracle: oracleNft },
      interestOracleNft: dummyAc,
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
      nextIAsset: 'Nothing',
    });

    const lrpParams: LRPParams = {
      versionRecordToken: {
        currencySymbol: fromText('smth'),
        tokenName: fromText('version_record'),
      },
      iassetNft: iassetNft,
      iassetPolicyId: iassetPolicyId,
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

    const lrpOutRef = matchSingle(
      await findLrp(
        lucid,
        network,
        lrpValidatorHash,
        ownPkh.hash,
        iassetTokenName,
      ),
      (res) => new Error('Expected a single LRP UTXO.: ' + JSON.stringify(res)),
    );

    await runAndAwaitTx(lucid, cancelLrp(lrpOutRef, lrpRefScriptOutRef, lucid));

    // await runAndAwaitTx(
    //   lucid,
    //   redeemLrp(
    //     [[lrpOutRef, 5_000_000n]],
    //     lrpRefScriptOutRef,
    //     await findPriceOracle(lucid, network, oracleValidatorHash, oracleNft),
    //     await findIAsset(
    //       lucid,
    //       network,
    //       iassetValHash,
    //       iassetNft,
    //       iassetTokenName,
    //     ),
    //     lucid,
    //     lrpParams,
    //     priceOracleParams,
    //     network,
    //   ),
    // );
  });
});
