import {
  addAssets,
  Emulator,
  EmulatorAccount,
  fromText,
  generateEmulatorAccount,
  Lucid,
} from '@lucid-evolution/lucid';
import { describe, beforeEach, test, expect } from 'vitest';
import { mkLovelacesOf } from '../src/helpers/value-helpers';
import { init } from './endpoints/initialize';
import { findGov } from './queries/governance-queries';
import {
  addrDetails,
  createProposal,
  createShardsChunks,
  fromSystemParamsAsset,
  InterestOracleContract,
} from '../src';
import {
  LucidContext,
  runAndAwaitTx,
  runAndAwaitTxBuilder,
} from './test-helpers';
import { startPriceOracleTx } from '../src/contracts/price-oracle';
import { findAllIAssets } from './queries/iasset-queries';
import { findPollManager } from './queries/poll-queries';

type MyContext = LucidContext<{
  admin: EmulatorAccount;
  user: EmulatorAccount;
}>;

describe('Gov', () => {
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

  test<MyContext>('Create text proposal', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const sysParams = await init(context.lucid);

    const govUtxo = await findGov(
      context.lucid,
      sysParams.validatorHashes.govHash,
      fromSystemParamsAsset(sysParams.govParams.govNFT),
    );

    const [tx, _] = await createProposal(
      { TextProposal: { bytes: fromText('smth') } },
      null,
      sysParams,
      context.lucid,
      context.emulator.slot,
      govUtxo.utxo,
      [],
    );

    await runAndAwaitTxBuilder(context.lucid, tx);
  });

  test<MyContext>('Create text proposal with shards', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const sysParams = await init(context.lucid);

    const govUtxo = await findGov(
      context.lucid,
      sysParams.validatorHashes.govHash,
      fromSystemParamsAsset(sysParams.govParams.govNFT),
    );

    const [tx, pollId] = await createProposal(
      { TextProposal: { bytes: fromText('smth') } },
      null,
      sysParams,
      context.lucid,
      context.emulator.slot,
      govUtxo.utxo,
      [],
    );

    await runAndAwaitTxBuilder(context.lucid, tx);

    for (
      let i = 0;
      i < Math.ceil(Number(govUtxo.datum.protocolParams.totalShards) / 2);
      i++
    ) {
      const pollUtxo = await findPollManager(
        context.lucid,
        sysParams.validatorHashes.pollManagerHash,
        fromSystemParamsAsset(sysParams.pollManagerParams.pollToken),
        pollId,
      );

      await runAndAwaitTx(
        context.lucid,
        createShardsChunks(
          2n,
          pollUtxo.utxo,
          sysParams,
          context.emulator.slot,
          context.lucid,
        ),
      );
    }

    const pollUtxo = await findPollManager(
      context.lucid,
      sysParams.validatorHashes.pollManagerHash,
      fromSystemParamsAsset(sysParams.pollManagerParams.pollToken),
      pollId,
    );

    expect(
      pollUtxo.datum.createdShardsCount === pollUtxo.datum.totalShardsCount,
      'Expected total shards count being created',
    );
  });

  test<MyContext>('Create asset proposal', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const sysParams = await init(context.lucid);

    const [pkh, _] = await addrDetails(context.lucid);

    const [startInterestTx, interestOracleNft] =
      await InterestOracleContract.startInterestOracle(
        0n,
        0n,
        0n,
        {
          biasTime: 120_000n,
          owner: pkh.hash,
        },
        context.lucid,
      );
    await runAndAwaitTxBuilder(context.lucid, startInterestTx);

    const [priceOracleTx, priceOranceNft] = await startPriceOracleTx(
      context.lucid,
      'IBTC_ORACLE',
      { getOnChainInt: 1_000_000n },
      { biasTime: 120_000n, expiration: 1_800_000n, owner: pkh.hash },
    );
    await runAndAwaitTxBuilder(context.lucid, priceOracleTx);

    const govUtxo = await findGov(
      context.lucid,
      sysParams.validatorHashes.govHash,
      fromSystemParamsAsset(sysParams.govParams.govNFT),
    );

    const allIassetOrefs = (
      await findAllIAssets(
        context.lucid,
        sysParams.validatorHashes.cdpHash,
        fromSystemParamsAsset(sysParams.cdpParams.iAssetAuthToken),
      )
    ).map((iasset) => iasset.utxo);

    const [tx, __] = await createProposal(
      {
        ProposeAsset: {
          asset: fromText('iBTC'),
          priceOracleNft: priceOranceNft,
          interestOracleNft: interestOracleNft,
          redemptionRatioPercentage: { getOnChainInt: 200_000_000n },
          maintenanceRatioPercentage: { getOnChainInt: 150_000_000n },
          liquidationRatioPercentage: { getOnChainInt: 120_000_000n },
          debtMintingFeePercentage: { getOnChainInt: 500_000n },
          liquidationProcessingFeePercentage: { getOnChainInt: 2_000_000n },
          stabilityPoolWithdrawalFeePercentage: { getOnChainInt: 500_000n },
          redemptionReimbursementPercentage: { getOnChainInt: 1_000_000n },
          redemptionProcessingFeePercentage: { getOnChainInt: 1_000_000n },
          interestCollectorPortionPercentage: { getOnChainInt: 40_000_000n },
        },
      },
      null,
      sysParams,
      context.lucid,
      context.emulator.slot,
      govUtxo.utxo,
      allIassetOrefs,
    );

    await runAndAwaitTxBuilder(context.lucid, tx);
  });
});
