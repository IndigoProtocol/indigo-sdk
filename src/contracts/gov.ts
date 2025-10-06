// import { OutRef } from '@lucid-evolution/lucid';
import {
  addAssets,
  Constr,
  LucidEvolution,
  OutRef,
  paymentCredentialOf,
  slotToUnixTime,
  toText,
  TxBuilder,
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
  serialisePollDatum,
} from '../types/indigo/poll';
import { mkAssetsOf } from '../helpers/value-helpers';
import { Data } from '@lucid-evolution/lucid';
import { IAssetHelpers, IAssetOutput } from '../helpers/asset-helpers';
import { array } from 'fp-ts';
import { pipe } from 'fp-ts/lib/function';
import { option as O, string as S, ord as Ord } from 'fp-ts';
import { match, P } from 'ts-pattern';
import {
  fromSystemParamsAsset,
  fromSystemParamsScriptRef,
  SystemParams,
} from '../types/system-params';
import { serialisePollManagerRedeemer } from '../types/indigo/poll-manager';
import { ONE_SECOND } from '../helpers/time-helpers';
import { addressFromBech32 } from '../types/generic';

function proposalDeposit(baseDeposit: bigint, activeProposals: bigint): bigint {
  return baseDeposit * (2n ^ activeProposals);
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
): Promise<TxBuilder> {
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

  return (
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
                pollId: govDatum.currentProposal + 1n,
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
      .addSigner(ownAddr)
  );
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
    .validTo(Number(currentTime + sysParams.govParams.gBiasTime) - ONE_SECOND)
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
    );

  for (let idx = 0; idx < shardsCount; idx++) {
    tx.pay.ToContract(
      sysParams.validatorHashes.pollShardHash,
      {
        kind: 'inline',
        value: serialisePollDatum({
          PollShard: {
            content: {
              pollId: pollManager.pollId,
              status: { yesVotes: 0n, noVotes: 0n },
              votingEndTime: pollManager.votingEndTime,
              managerAddress: addressFromBech32(
                createScriptAddress(
                  network,
                  sysParams.validatorHashes.pollManagerHash,
                ),
              ),
            },
          },
        }),
      },
      mkAssetsOf(pollNft, 1n),
    );
  }

  return tx;
}

// export function mergeShards(shardsOutRefs: [OutRef], pollManagerId: bigint) {}

// export function vote(pollShardId: bigint) {}

// export function endProposal(proposalId: bigint) {}

// export function executeProposal(upgradeId: bigint) {}
