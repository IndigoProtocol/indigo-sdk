import {
  addAssets,
  Emulator,
  EmulatorAccount,
  fromText,
  generateEmulatorAccount,
  Lucid,
  unixTimeToSlot,
} from '@lucid-evolution/lucid';
import { describe, beforeEach, test, expect, assert } from 'vitest';
import { assetClassValueOf, mkLovelacesOf } from '../src/helpers/value-helpers';
import { init } from './endpoints/initialize';
import { findGov } from './queries/governance-queries';
import {
  addrDetails,
  createProposal,
  createScriptAddress,
  createShardsChunks,
  endProposal,
  fromSystemParamsAsset,
  InterestOracleContract,
  matchSingle,
  mergeShards,
  StakingContract,
  SystemParams,
  vote,
  VoteOption,
} from '../src';
import {
  LucidContext,
  runAndAwaitTx,
  runAndAwaitTxBuilder,
} from './test-helpers';
import { startPriceOracleTx } from '../src/contracts/price-oracle';
import { findAllIAssets } from './queries/iasset-queries';
import {
  findAllPollShards,
  findPollManager,
  findRandomPollShard,
} from './queries/poll-queries';
import { findStakingPosition } from './queries/staking-queries';
import {
  readonlyArray as RA,
  task as T,
  array as A,
  function as F,
  number as N,
} from 'fp-ts';
import { findExecute } from './queries/execute-queries';
import { getNewUtxosAtAddressAfterAction } from './utils';

type MyContext = LucidContext<{
  admin: EmulatorAccount;
  user: EmulatorAccount;
}>;

async function runVote(
  pollId: bigint,
  option: VoteOption,
  sysParams: SystemParams,
  context: MyContext,
): Promise<void> {
  const [pkh, _] = await addrDetails(context.lucid);

  const stakingPosOref = await findStakingPosition(
    context.lucid,
    sysParams.validatorHashes.stakingHash,
    fromSystemParamsAsset(sysParams.stakingParams.stakingToken),
    pkh.hash,
  );

  const pollShard = await findRandomPollShard(
    context.lucid,
    sysParams.validatorHashes.pollShardHash,
    fromSystemParamsAsset(sysParams.pollShardParams.pollToken),
    pollId,
  );

  await runAndAwaitTx(
    context.lucid,
    vote(
      option,
      pollShard.utxo,
      stakingPosOref.utxo,
      sysParams,
      context.lucid,
      context.emulator.slot,
    ),
  );
}

async function runCreateAllShards(
  pollId: bigint,
  sysParams: SystemParams,
  context: MyContext,
): Promise<void> {
  const govUtxo = await findGov(
    context.lucid,
    sysParams.validatorHashes.govHash,
    fromSystemParamsAsset(sysParams.govParams.govNFT),
  );

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
}

async function runMergeAllShards(
  pollId: bigint,
  sysParams: SystemParams,
  context: MyContext,
): Promise<void> {
  const govUtxo = await findGov(
    context.lucid,
    sysParams.validatorHashes.govHash,
    fromSystemParamsAsset(sysParams.govParams.govNFT),
  );

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

    const allPollShards = await findAllPollShards(
      context.lucid,
      sysParams.validatorHashes.pollShardHash,
      fromSystemParamsAsset(sysParams.pollShardParams.pollToken),
      pollUtxo.datum.pollId,
    );

    await runAndAwaitTx(
      context.lucid,
      mergeShards(
        pollUtxo.utxo,
        A.takeLeft(2)(allPollShards).map((u) => u.utxo),
        sysParams,
        context.lucid,
        context.emulator.slot,
      ),
    );
  }
}

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

    await runCreateAllShards(pollId, sysParams, context);

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

  test<MyContext>('Merge proposal shards', async (context: MyContext) => {
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

    {
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

      const targetSlot = unixTimeToSlot(
        context.lucid.config().network!,
        Number(pollUtxo.datum.votingEndTime),
      );
      expect(targetSlot).toBeGreaterThan(context.emulator.slot);

      context.emulator.awaitSlot(targetSlot - context.emulator.slot + 1);
    }

    {
      const pollUtxo = await findPollManager(
        context.lucid,
        sysParams.validatorHashes.pollManagerHash,
        fromSystemParamsAsset(sysParams.pollManagerParams.pollToken),
        pollId,
      );

      const allPollShards = await findAllPollShards(
        context.lucid,
        sysParams.validatorHashes.pollShardHash,
        fromSystemParamsAsset(sysParams.pollShardParams.pollToken),
        pollUtxo.datum.pollId,
      );

      assert(allPollShards.length === 2);

      await runAndAwaitTx(
        context.lucid,
        mergeShards(
          pollUtxo.utxo,
          allPollShards.map((u) => u.utxo),
          sysParams,
          context.lucid,
          context.emulator.slot,
        ),
      );
    }

    const pollUtxo = await findPollManager(
      context.lucid,
      sysParams.validatorHashes.pollManagerHash,
      fromSystemParamsAsset(sysParams.pollManagerParams.pollToken),
      pollId,
    );

    assert(pollUtxo.datum.talliedShardsCount === 2n);
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

  test<MyContext>('Vote on proposal', async (context: MyContext) => {
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

    await runCreateAllShards(pollId, sysParams, context);

    await runAndAwaitTx(
      context.lucid,
      StakingContract.openPosition(1_000_000n, sysParams, context.lucid),
    );

    await runVote(pollId, 'Yes', sysParams, context);
  });

  test<MyContext>('Vote on 2 proposals sequentially (lower pollID first)', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const sysParams = await init(context.lucid);

    await runAndAwaitTx(
      context.lucid,
      StakingContract.openPosition(1_000_000n, sysParams, context.lucid),
    );
    const [pkh, _] = await addrDetails(context.lucid);

    // Create proposals
    const createProposalsTask = F.pipe(
      [fromText('proposal 1'), fromText('proposal 2')].map(
        (txtContent): T.Task<bigint> => {
          return async () => {
            const govUtxo = await findGov(
              context.lucid,
              sysParams.validatorHashes.govHash,
              fromSystemParamsAsset(sysParams.govParams.govNFT),
            );

            const [tx, pollId] = await createProposal(
              { TextProposal: { bytes: txtContent } },
              null,
              sysParams,
              context.lucid,
              context.emulator.slot,
              govUtxo.utxo,
              [],
            );

            await runAndAwaitTxBuilder(context.lucid, tx);

            await runCreateAllShards(pollId, sysParams, context);

            return pollId;
          };
        },
      ),
      T.sequenceSeqArray,
    );

    const pollIds = await createProposalsTask();

    // vote on each proposal
    const voteEachProposalTask = F.pipe(
      pollIds.map(
        (pollId): T.Task<void> =>
          async () => {
            await runVote(
              pollId,
              Number(pollId) % 2 == 0 ? 'Yes' : 'No',
              sysParams,
              context,
            );
          },
      ),
      T.sequenceSeqArray,
    );

    await voteEachProposalTask();

    const stakingPosUtxo = await findStakingPosition(
      context.lucid,
      sysParams.validatorHashes.stakingHash,
      fromSystemParamsAsset(sysParams.stakingParams.stakingToken),
      pkh.hash,
    );

    expect([...stakingPosUtxo.datum.lockedAmount.keys()]).toEqual([1n, 2n]);
  });

  test<MyContext>('Vote on 2 proposals in reverse (higher pollID first), both yes and no votes', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const sysParams = await init(context.lucid);

    await runAndAwaitTx(
      context.lucid,
      StakingContract.openPosition(1_000_000n, sysParams, context.lucid),
    );
    const [pkh, _] = await addrDetails(context.lucid);

    // Create proposals
    const createProposalsTask = F.pipe(
      [fromText('proposal 1'), fromText('proposal 2')].map(
        (txtContent): T.Task<bigint> => {
          return async () => {
            const govUtxo = await findGov(
              context.lucid,
              sysParams.validatorHashes.govHash,
              fromSystemParamsAsset(sysParams.govParams.govNFT),
            );

            const [tx, pollId] = await createProposal(
              { TextProposal: { bytes: txtContent } },
              null,
              sysParams,
              context.lucid,
              context.emulator.slot,
              govUtxo.utxo,
              [],
            );

            await runAndAwaitTxBuilder(context.lucid, tx);

            await runCreateAllShards(pollId, sysParams, context);

            return pollId;
          };
        },
      ),
      T.sequenceSeqArray,
    );

    const pollIdsDescending = F.pipe(
      await createProposalsTask(),
      RA.toArray, // Sort it from high to low
      A.map(Number),
      A.sort(N.Ord),
      A.map(BigInt),
      A.reverse,
    );

    // vote on each proposal
    const voteEachProposalTask = F.pipe(
      pollIdsDescending.map(
        (pollId): T.Task<void> =>
          async () => {
            await runVote(
              pollId,
              Number(pollId) % 2 == 0 ? 'Yes' : 'No',
              sysParams,
              context,
            );
          },
      ),
      T.sequenceSeqArray,
    );

    await voteEachProposalTask();

    const stakingPosUtxo = await findStakingPosition(
      context.lucid,
      sysParams.validatorHashes.stakingHash,
      fromSystemParamsAsset(sysParams.stakingParams.stakingToken),
      pkh.hash,
    );

    expect([...stakingPosUtxo.datum.lockedAmount.keys()]).toEqual([2n, 1n]);
  });

  test<MyContext>('End passed proposal', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const sysParams = await init(context.lucid);

    const [tx, pollId] = await createProposal(
      { TextProposal: { bytes: fromText('smth') } },
      null,
      sysParams,
      context.lucid,
      context.emulator.slot,
      (
        await findGov(
          context.lucid,
          sysParams.validatorHashes.govHash,
          fromSystemParamsAsset(sysParams.govParams.govNFT),
        )
      ).utxo,
      [],
    );

    await runAndAwaitTxBuilder(context.lucid, tx);

    await runCreateAllShards(pollId, sysParams, context);

    await runAndAwaitTx(
      context.lucid,
      StakingContract.openPosition(100_000_000_000n, sysParams, context.lucid),
    );

    await runVote(pollId, 'Yes', sysParams, context);

    {
      const pollUtxo = await findPollManager(
        context.lucid,
        sysParams.validatorHashes.pollManagerHash,
        fromSystemParamsAsset(sysParams.pollManagerParams.pollToken),
        pollId,
      );

      const targetSlot = unixTimeToSlot(
        context.lucid.config().network!,
        Number(pollUtxo.datum.votingEndTime),
      );
      expect(targetSlot).toBeGreaterThan(context.emulator.slot);

      context.emulator.awaitSlot(targetSlot - context.emulator.slot + 1);
    }

    await runMergeAllShards(pollId, sysParams, context);

    const pollUtxo = await findPollManager(
      context.lucid,
      sysParams.validatorHashes.pollManagerHash,
      fromSystemParamsAsset(sysParams.pollManagerParams.pollToken),
      pollId,
    );

    const govUtxo = await findGov(
      context.lucid,
      sysParams.validatorHashes.govHash,
      fromSystemParamsAsset(sysParams.govParams.govNFT),
    );

    await runAndAwaitTx(
      context.lucid,
      endProposal(
        pollUtxo.utxo,
        govUtxo.utxo,
        sysParams,
        context.lucid,
        context.emulator.slot,
      ),
    );

    await expect(
      findExecute(
        context.lucid,
        sysParams.validatorHashes.executeHash,
        fromSystemParamsAsset(sysParams.executeParams.upgradeToken),
        pollId,
      ),
    ).resolves.toBeDefined();
  });

  test<MyContext>('End failed proposal', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const sysParams = await init(context.lucid);

    const [tx, pollId] = await createProposal(
      { TextProposal: { bytes: fromText('smth') } },
      null,
      sysParams,
      context.lucid,
      context.emulator.slot,
      (
        await findGov(
          context.lucid,
          sysParams.validatorHashes.govHash,
          fromSystemParamsAsset(sysParams.govParams.govNFT),
        )
      ).utxo,
      [],
    );

    await runAndAwaitTxBuilder(context.lucid, tx);

    await runCreateAllShards(pollId, sysParams, context);

    await runAndAwaitTx(
      context.lucid,
      StakingContract.openPosition(100_000_000_000n, sysParams, context.lucid),
    );

    await runVote(pollId, 'No', sysParams, context);

    {
      const pollUtxo = await findPollManager(
        context.lucid,
        sysParams.validatorHashes.pollManagerHash,
        fromSystemParamsAsset(sysParams.pollManagerParams.pollToken),
        pollId,
      );

      const targetSlot = unixTimeToSlot(
        context.lucid.config().network!,
        Number(pollUtxo.datum.votingEndTime),
      );
      expect(targetSlot).toBeGreaterThan(context.emulator.slot);

      context.emulator.awaitSlot(targetSlot - context.emulator.slot + 1);
    }

    await runMergeAllShards(pollId, sysParams, context);

    const pollUtxo = await findPollManager(
      context.lucid,
      sysParams.validatorHashes.pollManagerHash,
      fromSystemParamsAsset(sysParams.pollManagerParams.pollToken),
      pollId,
    );

    const govUtxo = await findGov(
      context.lucid,
      sysParams.validatorHashes.govHash,
      fromSystemParamsAsset(sysParams.govParams.govNFT),
    );

    const [_, newUtxos] = await getNewUtxosAtAddressAfterAction(
      context.lucid,
      createScriptAddress(
        context.lucid.config().network!,
        sysParams.validatorHashes.treasuryHash,
      ),
      () =>
        runAndAwaitTx(
          context.lucid,
          endProposal(
            pollUtxo.utxo,
            govUtxo.utxo,
            sysParams,
            context.lucid,
            context.emulator.slot,
          ),
        ),
    );

    const treasuryOutput = matchSingle(
      newUtxos,
      () => new Error('Expected single treasury output'),
    );

    assert(
      assetClassValueOf(
        treasuryOutput.assets,
        fromSystemParamsAsset(sysParams.govParams.indyAsset),
      ) === govUtxo.datum.protocolParams.proposalDeposit,
      'Treasury should get proposal deposit back on failed proposal end',
    );

    await expect(
      findExecute(
        context.lucid,
        sysParams.validatorHashes.executeHash,
        fromSystemParamsAsset(sysParams.executeParams.upgradeToken),
        pollId,
      ),
    ).rejects.toThrow();
  });
});
