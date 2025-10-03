// import { OutRef } from '@lucid-evolution/lucid';
import {
  addAssets,
  Constr,
  LucidEvolution,
  OutRef,
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
  addrDetails,
  createScriptAddress,
  getInlineDatumOrThrow,
} from '../helpers/lucid-utils';
import { serialisePollDatum } from '../types/indigo/poll';
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

  const [pkh, _] = await addrDetails(lucid);

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

  const pollAuthAssets = mkAssetsOf(
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
      .mintAssets(pollAuthAssets, Data.to(new Constr(0, [])))
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
          }),
        },
        addAssets(
          pollAuthAssets,
          mkAssetsOf(
            fromSystemParamsAsset(sysParams.govParams.indyAsset),
            proposalDeposit(
              govDatum.protocolParams.proposalDeposit,
              govDatum.activeProposals,
            ),
          ),
        ),
      )
  );
}

// export function createShardsChunks(chunkSize: bigint, pollManagerId: bigint) {}

// export function mergeShards(shardsOutRefs: [OutRef], pollManagerId: bigint) {}

// export function vote(pollShardId: bigint) {}

// export function endProposal(proposalId: bigint) {}

// export function executeProposal(upgradeId: bigint) {}
