// import { OutRef } from '@lucid-evolution/lucid';
import {
  addAssets,
  Assets,
  Constr,
  LucidEvolution,
  OutRef,
  paymentCredentialOf,
  slotToUnixTime,
  toText,
  TxBuilder,
  UTxO,
} from '@lucid-evolution/lucid';
import {
  parseGovDatumOrThrow,
  ProposalContent,
  serialiseGovDatum,
  serialiseGovRedeemer,
  TreasuryWithdrawal,
} from '../types/indigo/gov';
import { matchSingle } from '../helpers/helpers';
import {
  createScriptAddress,
  getInlineDatumOrThrow,
} from '../helpers/lucid-utils';
import {
  parsePollManagerOrThrow,
  parsePollShardOrThrow,
  PollShardContent,
  PollStatus,
  serialisePollDatum,
} from '../types/indigo/poll';
import {
  assetClassValueOf,
  lovelacesAmt,
  mkAssetsOf,
  mkLovelacesOf,
} from '../helpers/value-helpers';
import { Data } from '@lucid-evolution/lucid';
import { IAssetHelpers, IAssetOutput } from '../helpers/asset-helpers';
import { array } from 'fp-ts';
import { pipe } from 'fp-ts/lib/function';
import {
  array as A,
  option as O,
  string as S,
  ord as Ord,
  function as F,
} from 'fp-ts';
import { match, P } from 'ts-pattern';
import {
  fromSystemParamsAsset,
  fromSystemParamsScriptRef,
  SystemParams,
} from '../types/system-params';
import { serialisePollManagerRedeemer } from '../types/indigo/poll-manager';
import { ONE_SECOND } from '../helpers/time-helpers';
import { addressFromBech32 } from '../types/generic';
import { serialiseStakingRedeemer } from '../types/indigo/staking';
import {
  serialisePollShardRedeemer,
  VoteOption,
} from '../types/indigo/poll-shard';
import {
  parseStakingPositionOrThrow,
  serialiseStakingDatum,
  StakingPosLockedAmt,
} from '../types/indigo/staking-new';
import { updateStakingLockedAmount } from '../helpers/staking-helpers';
import { pollPassQuorum } from '../helpers/poll-helpers';
import { serialiseExecuteDatum } from '../types/indigo/execute';

function proposalDeposit(baseDeposit: bigint, activeProposals: bigint): bigint {
  return baseDeposit * 2n ** activeProposals;
}

/**
 * Find the IAsset that should be a preceding one for the new IAsset token name.
 * In case there are no iassets, none should be returned.
 */
async function findRelativeIAssetForInsertion(
  /**
   * UFT encoded
   */
  newIAssetTokenName: string,
  allIAssetOrefs: OutRef[],
  lucid: LucidEvolution,
): Promise<O.Option<IAssetOutput>> {
  const iassetUtxos = await Promise.all(
    allIAssetOrefs.map((oref) => IAssetHelpers.findIAssetByRef(oref, lucid)),
  );

  // The iasset just before the new token name based on assets ordering
  return pipe(
    // Sort the asset names
    iassetUtxos,

    array.sort(
      Ord.contramap<string, IAssetOutput>((x) => toText(x.datum.assetName))(
        S.Ord,
      ),
    ),
    // split head and tail
    array.foldLeft(
      () => O.none,
      (head, rest) => O.some<[IAssetOutput, IAssetOutput[]]>([head, rest]),
    ),
    // find the preceding iasset for the new token name
    O.flatMap(([firstIAsset, rest]) =>
      O.some(
        array.reduce<IAssetOutput, IAssetOutput>(firstIAsset, (acc, iasset) =>
          toText(iasset.datum.assetName) < newIAssetTokenName ? iasset : acc,
        )(rest),
      ),
    ),
  );
}

/**
 * Returns the new PollId.
 */
export async function createProposal(
  proposalContent: ProposalContent,
  treasuryWithdrawal: TreasuryWithdrawal | null,
  sysParams: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
  govOref: OutRef,
  /**
   * This has to be passed only in case of createAsset proposal
   */
  allIAssetOrefs: OutRef[],
): Promise<[TxBuilder, bigint]> {
  const network = lucid.config().network!;
  const currentTime = BigInt(slotToUnixTime(network, currentSlot));

  const ownAddr = await lucid.wallet().address();
  const pkh = paymentCredentialOf(ownAddr);

  const govRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.governanceValidatorRef,
      ),
    ]),
    (_) => new Error('Expected a single Gov Ref Script UTXO'),
  );
  const pollAuthTokenPolicyRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.authTokenPolicies.pollManagerTokenRef,
      ),
    ]),
    (_) =>
      new Error('Expected a single poll auth token policy ref Script UTXO'),
  );
  const govUtxo = matchSingle(
    await lucid.utxosByOutRef([govOref]),
    (_) => new Error('Expected a single Gov UTXO'),
  );

  const govDatum = parseGovDatumOrThrow(getInlineDatumOrThrow(govUtxo));

  const votingEndTime = currentTime + govDatum.protocolParams.votingPeriod;
  const expirationTime =
    votingEndTime + govDatum.protocolParams.expirationPeriod;
  const proposingEndTime =
    currentTime + govDatum.protocolParams.proposingPeriod;

  const pollNftValue = mkAssetsOf(
    fromSystemParamsAsset(sysParams.govParams.pollToken),
    1n,
  );

  const newPollId = govDatum.currentProposal + 1n;

  const tx = lucid.newTx();

  // Add iAsset ref input when Propose asset proposal
  await match(proposalContent)
    .with({ ProposeAsset: { asset: P.select() } }, async (newAsset) => {
      const relativeIAsset = await findRelativeIAssetForInsertion(
        toText(newAsset),
        allIAssetOrefs,
        lucid,
      );

      pipe(
        relativeIAsset,
        O.match(
          () => {
            if (govDatum.iassetsCount !== 0n) {
              throw new Error(
                'Has to find relative iAsset when there are iAssets.',
              );
            }
          },
          (relative) => {
            tx.readFrom([relative.utxo]);
          },
        ),
      );
    })
    .otherwise(() => {});

  return [
    tx
      .mintAssets(pollNftValue, Data.to(new Constr(0, [])))
      // Ref scripts
      .readFrom([govRefScriptUtxo, pollAuthTokenPolicyRefScriptUtxo])
      .collectFrom(
        [govUtxo],
        serialiseGovRedeemer({
          CreatePoll: {
            content: proposalContent,
            currentTime: currentTime,
            proposalOwner: pkh.hash,
            treasuryWithdrawal: treasuryWithdrawal,
          },
        }),
      )
      .pay.ToContract(
        govUtxo.address,
        {
          kind: 'inline',
          value: serialiseGovDatum({
            ...govDatum,
            currentProposal: govDatum.currentProposal + 1n,
            activeProposals: govDatum.activeProposals + 1n,
          }),
        },
        govUtxo.assets,
      )
      .pay.ToContract(
        createScriptAddress(network, sysParams.validatorHashes.pollManagerHash),
        {
          kind: 'inline',
          value: serialisePollDatum({
            PollManager: {
              content: {
                pollId: newPollId,
                pollOwner: pkh.hash,
                content: proposalContent,
                treasuryWithdrawal: treasuryWithdrawal,
                status: { yesVotes: 0n, noVotes: 0n },
                votingEndTime: votingEndTime,
                createdShardsCount: 0n,
                talliedShardsCount: 0n,
                totalShardsCount: govDatum.protocolParams.totalShards,
                proposingEndTime: proposingEndTime,
                expirationTime: expirationTime,
                protocolVersion: govDatum.currentVersion,
                minimumQuorum: govDatum.protocolParams.minimumQuorum,
              },
            },
          }),
        },
        addAssets(
          pollNftValue,
          mkAssetsOf(
            fromSystemParamsAsset(sysParams.govParams.indyAsset),
            proposalDeposit(
              govDatum.protocolParams.proposalDeposit,
              govDatum.activeProposals,
            ),
          ),
        ),
      )
      .validFrom(Number(currentTime) - ONE_SECOND)
      .validTo(Number(currentTime + sysParams.govParams.gBiasTime) - ONE_SECOND)
      .addSigner(ownAddr),
    newPollId,
  ];
}

/**
 * Builds transaction creating shards of count chunk size.
 */
export async function createShardsChunks(
  /**
   * This gets automatically capped to total shards count.
   */
  chunkSize: bigint,
  pollManagerOref: OutRef,
  sysParams: SystemParams,
  currentSlot: number,
  lucid: LucidEvolution,
): Promise<TxBuilder> {
  const network = lucid.config().network!;
  const currentTime = BigInt(slotToUnixTime(network, currentSlot));

  const ownAddr = await lucid.wallet().address();

  const pollManagerUtxo = matchSingle(
    await lucid.utxosByOutRef([pollManagerOref]),
    (_) => new Error('Expected a single Poll manager UTXO'),
  );

  const pollManager = parsePollManagerOrThrow(
    getInlineDatumOrThrow(pollManagerUtxo),
  );

  if (pollManager.createdShardsCount >= pollManager.totalShardsCount) {
    throw new Error('All shards already created.');
  }

  const pollAuthTokenPolicyRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.authTokenPolicies.pollManagerTokenRef,
      ),
    ]),
    (_) =>
      new Error('Expected a single poll auth token policy ref Script UTXO'),
  );
  const pollManagerRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.pollManagerValidatorRef,
      ),
    ]),
    (_) =>
      new Error('Expected a single poll auth token policy ref Script UTXO'),
  );

  const shardsCount = BigInt(
    Math.min(
      Number(chunkSize),
      Number(pollManager.totalShardsCount - pollManager.createdShardsCount),
    ),
  );

  const pollNft = fromSystemParamsAsset(sysParams.govParams.pollToken);

  const tx = lucid
    .newTx()
    .validFrom(Number(currentTime) - ONE_SECOND)
    .validTo(
      Number(currentTime + sysParams.pollManagerParams.pBiasTime) - ONE_SECOND,
    )
    .mintAssets(mkAssetsOf(pollNft, shardsCount), Data.to(new Constr(0, [])))
    // Ref scripts
    .readFrom([pollAuthTokenPolicyRefScriptUtxo, pollManagerRefScriptUtxo])
    .collectFrom(
      [pollManagerUtxo],
      serialisePollManagerRedeemer({ CreateShards: { currentTime } }),
    )
    .pay.ToContract(
      pollManagerUtxo.address,
      {
        kind: 'inline',
        value: serialisePollDatum({
          PollManager: {
            content: {
              ...pollManager,
              createdShardsCount: pollManager.createdShardsCount + shardsCount,
            },
          },
        }),
      },
      pollManagerUtxo.assets,
    )
    .addSigner(ownAddr);

  for (let idx = 0; idx < shardsCount; idx++) {
    tx.pay.ToContract(
      createScriptAddress(network, sysParams.validatorHashes.pollShardHash),
      {
        kind: 'inline',
        value: serialisePollDatum({
          PollShard: {
            content: {
              pollId: pollManager.pollId,
              status: { yesVotes: 0n, noVotes: 0n },
              votingEndTime: pollManager.votingEndTime,
              managerAddress: addressFromBech32(pollManagerUtxo.address),
            },
          },
        }),
      },
      mkAssetsOf(pollNft, 1n),
    );
  }

  return tx;
}

/**
 * Updates both locked amount and poll status based on the vote.
 */
function voteHelper(
  stakingPosLockedAmt: StakingPosLockedAmt,
  pollShard: PollShardContent,
  voteOption: VoteOption,
  currentTime: bigint,
  indyStakedAmt: bigint,
): [StakingPosLockedAmt, PollStatus] {
  const newPollStatus = match(voteOption)
    .returnType<PollStatus>()
    .with('Yes', () => ({
      ...pollShard.status,
      yesVotes: pollShard.status.yesVotes + indyStakedAmt,
    }))
    .with('No', () => ({
      ...pollShard.status,
      noVotes: pollShard.status.noVotes + indyStakedAmt,
    }))
    .exhaustive();

  const newLockedAmt: [
    bigint,
    { readonly voteAmt: bigint; readonly votingEnd: bigint },
  ][] = [
    ...updateStakingLockedAmount(stakingPosLockedAmt, currentTime).entries(),
    [
      pollShard.pollId,
      { voteAmt: indyStakedAmt, votingEnd: pollShard.votingEndTime },
    ],
  ];

  return [new Map(newLockedAmt), newPollStatus];
}

export async function vote(
  voteOption: VoteOption,
  pollShardOref: OutRef,
  stakingPositionOref: OutRef,
  sysParams: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  const network = lucid.config().network!;
  const currentTime = BigInt(slotToUnixTime(network, currentSlot));

  const ownAddr = await lucid.wallet().address();

  const pollShardRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.pollShardValidatorRef,
      ),
    ]),
    (_) => new Error('Expected a single poll shard ref Script UTXO'),
  );
  const stakingRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(sysParams.scriptReferences.stakingValidatorRef),
    ]),
    (_) => new Error('Expected a single staking ref Script UTXO'),
  );

  const pollShardUtxo = matchSingle(
    await lucid.utxosByOutRef([pollShardOref]),
    (_) => new Error('Expected a single Poll shard UTXO'),
  );
  const pollShardDatum = parsePollShardOrThrow(
    getInlineDatumOrThrow(pollShardUtxo),
  );

  const stakingPosUtxo = matchSingle(
    await lucid.utxosByOutRef([stakingPositionOref]),
    (_) => new Error('Expected a single staking position UTXO'),
  );
  const stakingPosDatum = parseStakingPositionOrThrow(
    getInlineDatumOrThrow(stakingPosUtxo),
  );

  const indyStakedAmt = assetClassValueOf(
    stakingPosUtxo.assets,
    fromSystemParamsAsset(sysParams.govParams.indyAsset),
  );

  const validityFrom = Number(currentTime) - ONE_SECOND;

  if (stakingPosDatum.lockedAmount.has(pollShardDatum.pollId)) {
    throw new Error('Already voted for that proposal.');
  }

  const [newLockedAmt, newVoteStatus] = voteHelper(
    stakingPosDatum.lockedAmount,
    pollShardDatum,
    voteOption,
    BigInt(validityFrom),
    indyStakedAmt,
  );

  return lucid
    .newTx()
    .validFrom(validityFrom)
    .validTo(Number(pollShardDatum.votingEndTime) - ONE_SECOND)
    .readFrom([stakingRefScriptUtxo, pollShardRefScriptUtxo])
    .collectFrom([stakingPosUtxo], serialiseStakingRedeemer('Lock'))
    .collectFrom(
      [pollShardUtxo],
      serialisePollShardRedeemer({ Vote: { content: voteOption } }),
    )
    .pay.ToContract(
      pollShardUtxo.address,
      {
        kind: 'inline',
        value: serialisePollDatum({
          PollShard: {
            content: {
              ...pollShardDatum,
              status: newVoteStatus,
            },
          },
        }),
      },
      pollShardUtxo.assets,
    )
    .pay.ToContract(
      stakingPosUtxo.address,
      {
        kind: 'inline',
        value: serialiseStakingDatum({
          ...stakingPosDatum,
          lockedAmount: newLockedAmt,
        }),
      },
      stakingPosUtxo.assets,
    )
    .addSigner(ownAddr);
}

export async function mergeShards(
  pollManagerOref: OutRef,
  shardsOutRefs: OutRef[],
  sysParams: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  const network = lucid.config().network!;
  const currentTime = BigInt(slotToUnixTime(network, currentSlot));

  const ownAddr = await lucid.wallet().address();

  const pollShardRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.pollShardValidatorRef,
      ),
    ]),
    (_) => new Error('Expected a single poll shard ref Script UTXO'),
  );
  const pollManagerRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.pollManagerValidatorRef,
      ),
    ]),
    (_) => new Error('Expected a single poll shard ref Script UTXO'),
  );

  const pollAuthTokenPolicyRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.authTokenPolicies.pollManagerTokenRef,
      ),
    ]),
    (_) =>
      new Error('Expected a single poll auth token policy ref Script UTXO'),
  );

  const pollManagerUtxo = matchSingle(
    await lucid.utxosByOutRef([pollManagerOref]),
    (_) => new Error('Expected a single Poll manager UTXO'),
  );

  const pollManagerDatum = parsePollManagerOrThrow(
    getInlineDatumOrThrow(pollManagerUtxo),
  );

  const shardUtxos = await lucid.utxosByOutRef(shardsOutRefs);

  const aggregatedStatus: PollStatus = F.pipe(
    shardUtxos,
    A.map((utxo) => parsePollShardOrThrow(getInlineDatumOrThrow(utxo))),
    A.reduce<PollShardContent, PollStatus>(
      pollManagerDatum.status,
      (acc, shard) => ({
        yesVotes: acc.yesVotes + shard.status.yesVotes,
        noVotes: acc.noVotes + shard.status.noVotes,
      }),
    ),
  );

  const shardsAggregatedAda = A.reduce<UTxO, Assets>({}, (acc, utxo) =>
    addAssets(acc, mkLovelacesOf(lovelacesAmt(utxo.assets))),
  )(shardUtxos);

  const pollNft = fromSystemParamsAsset(sysParams.govParams.pollToken);

  return lucid
    .newTx()
    .validFrom(Number(currentTime) - ONE_SECOND)
    .validTo(
      Number(currentTime + sysParams.pollManagerParams.pBiasTime) - ONE_SECOND,
    )
    .readFrom([
      pollShardRefScriptUtxo,
      pollManagerRefScriptUtxo,
      pollAuthTokenPolicyRefScriptUtxo,
    ])
    .mintAssets(
      mkAssetsOf(pollNft, -BigInt(shardsOutRefs.length)),
      Data.to(new Constr(0, [])),
    )
    .collectFrom(
      [pollManagerUtxo],
      serialisePollManagerRedeemer({
        MergeShardsManager: { currentTime: currentTime },
      }),
    )
    .collectFrom(
      shardUtxos,
      serialisePollShardRedeemer({
        MergeShards: {
          currentTime: currentTime,
          pollManagerRef: {
            outputIndex: BigInt(pollManagerUtxo.outputIndex),
            txHash: { hash: pollManagerUtxo.txHash },
          },
        },
      }),
    )
    .pay.ToContract(
      pollManagerUtxo.address,
      {
        kind: 'inline',
        value: serialisePollDatum({
          PollManager: {
            content: {
              ...pollManagerDatum,
              talliedShardsCount:
                pollManagerDatum.talliedShardsCount +
                BigInt(shardsOutRefs.length),
              status: aggregatedStatus,
            },
          },
        }),
      },
      addAssets(pollManagerUtxo.assets, shardsAggregatedAda),
    )
    .addSigner(ownAddr);
}

export async function endProposal(
  pollManagerOref: OutRef,
  govOref: OutRef,
  sysParams: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  const network = lucid.config().network!;
  const currentTime = BigInt(slotToUnixTime(network, currentSlot));

  const ownAddr = await lucid.wallet().address();

  const pollManagerRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.pollManagerValidatorRef,
      ),
    ]),
    (_) => new Error('Expected a single poll shard ref Script UTXO'),
  );
  const govRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.governanceValidatorRef,
      ),
    ]),
    (_) => new Error('Expected a single Gov Ref Script UTXO'),
  );
  const pollAuthTokenPolicyRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.authTokenPolicies.pollManagerTokenRef,
      ),
    ]),
    (_) =>
      new Error('Expected a single poll auth token policy ref Script UTXO'),
  );
  const upgradeTokenPolicyRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.authTokenPolicies.upgradeTokenRef,
      ),
    ]),
    (_) =>
      new Error('Expected a single upgrade auth token policy ref Script UTXO'),
  );

  const pollManagerUtxo = matchSingle(
    await lucid.utxosByOutRef([pollManagerOref]),
    (_) => new Error('Expected a single Poll manager UTXO'),
  );
  const pollManager = parsePollManagerOrThrow(
    getInlineDatumOrThrow(pollManagerUtxo),
  );

  const govUtxo = matchSingle(
    await lucid.utxosByOutRef([govOref]),
    (_) => new Error('Expected a single Gov UTXO'),
  );
  const govDatum = parseGovDatumOrThrow(getInlineDatumOrThrow(govUtxo));

  const pollNft = fromSystemParamsAsset(sysParams.govParams.pollToken);
  const indyAsset = fromSystemParamsAsset(
    sysParams.pollManagerParams.indyAsset,
  );

  const proposalExpired = currentTime > pollManager.expirationTime;
  const proposalPassed =
    !proposalExpired &&
    pollPassQuorum(
      sysParams.pollManagerParams.initialIndyDistribution,
      pollManager.status,
      currentTime,
      pollManager.minimumQuorum,
      govDatum.treasuryIndyWithdrawnAmt,
    );

  const upgradeTokenVal = mkAssetsOf(
    fromSystemParamsAsset(sysParams.govParams.upgradeToken),
    1n,
  );

  const tx = lucid
    .newTx()
    .validFrom(Number(currentTime) - ONE_SECOND)
    .validTo(
      Number(currentTime + sysParams.pollManagerParams.pBiasTime) - ONE_SECOND,
    )
    .readFrom([
      pollManagerRefScriptUtxo,
      govRefScriptUtxo,
      pollAuthTokenPolicyRefScriptUtxo,
      upgradeTokenPolicyRefScriptUtxo,
    ])
    .collectFrom(
      [pollManagerUtxo],
      serialisePollManagerRedeemer({ EndPoll: { currentTime: currentTime } }),
    )
    .collectFrom(
      [govUtxo],
      serialiseGovRedeemer({ WitnessEndPoll: { currentTime: currentTime } }),
    )
    .mintAssets(mkAssetsOf(pollNft, -1n), Data.to(new Constr(0, [])))
    .pay.ToContract(
      govUtxo.address,
      {
        kind: 'inline',
        value: serialiseGovDatum({
          ...govDatum,
          activeProposals: govDatum.activeProposals - 1n,
        }),
      },
      govUtxo.assets,
    )
    .addSigner(ownAddr);

  if (proposalPassed) {
    tx.pay
      .ToContract(
        createScriptAddress(network, sysParams.validatorHashes.executeHash),
        {
          kind: 'inline',
          value: serialiseExecuteDatum({
            id: pollManager.pollId,
            content: pollManager.content,
            passedTime: currentTime,
            votingEndTime: pollManager.votingEndTime,
            protocolVersion: pollManager.protocolVersion,
            treasuryWithdrawal: pollManager.treasuryWithdrawal,
          }),
        },
        upgradeTokenVal,
      )
      .mintAssets(upgradeTokenVal, Data.to(new Constr(0, [])));
  } else {
    tx.pay.ToContract(
      createScriptAddress(network, sysParams.validatorHashes.treasuryHash),
      { kind: 'inline', value: Data.void() },
      mkAssetsOf(
        indyAsset,
        assetClassValueOf(pollManagerUtxo.assets, indyAsset),
      ),
    );
  }

  return tx;
}

// export function executeProposal(upgradeId: bigint) {}
