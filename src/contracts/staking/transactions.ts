import {
  addAssets,
  Data,
  fromHex,
  fromText,
  LucidEvolution,
  OutRef,
  slotToUnixTime,
  toHex,
  TxBuilder,
} from '@lucid-evolution/lucid';
import {
  fromSystemParamsScriptRef,
  SystemParams,
} from '../../types/system-params';
import { addrDetails, getInlineDatumOrThrow } from '../../utils/lucid-utils';
import {
  distributeReward,
  findStakingManager,
  findStakingManagerByOutRef,
  findStakingPositionByOutRef,
  rewardSnapshotPrecision,
  updateStakingLockedAmount,
} from './helpers';
import {
  parseStakingManagerDatum,
  serialiseStakingDatum,
  StakingManager,
  StakingPosition,
} from './types-new';
import { matchSingle } from '../../utils/utils';
import { serialiseStakingRedeemer } from './types';
import { serialiseCollectorRedeemer } from '../collector/types';
import { mkAssetsOf, mkLovelacesOf } from '../../utils/value-helpers';
import { ONE_SECOND } from '../../utils/time-helpers';

export async function openStakingPosition(
  amount: bigint,
  params: SystemParams,
  lucid: LucidEvolution,
  stakingManagerRef?: OutRef,
): Promise<TxBuilder> {
  const [pkh, _] = await addrDetails(lucid);

  const stakingManagerOut = stakingManagerRef
    ? await findStakingManagerByOutRef(stakingManagerRef, lucid)
    : await findStakingManager(params, lucid);

  const stakingRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(params.scriptReferences.stakingValidatorRef),
    ]),
    (_) => new Error('Expected a single staking Ref Script UTXO'),
  );
  const stakingTokenPolicyRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        params.scriptReferences.authTokenPolicies.stakingTokenRef,
      ),
    ]),
    (_) => new Error('Expected a single staking token policy Ref Script UTXO'),
  );

  const newStakingManagerDatum: StakingManager = {
    totalStake: stakingManagerOut.datum.totalStake + amount,
    managerSnapshot: {
      snapshotAda: stakingManagerOut.datum.managerSnapshot.snapshotAda,
    },
  };

  const stakingPositionDatum: StakingPosition = {
    owner: fromHex(pkh.hash),
    lockedAmount: new Map([]),
    positionSnapshot: {
      snapshotAda: stakingManagerOut.datum.managerSnapshot.snapshotAda,
    },
  };

  const stakingToken =
    params.stakingParams.stakingToken[0].unCurrencySymbol +
    fromText(params.stakingParams.stakingToken[1].unTokenName);
  const indyToken =
    params.stakingParams.indyToken[0].unCurrencySymbol +
    fromText(params.stakingParams.indyToken[1].unTokenName);
  return lucid
    .newTx()
    .collectFrom(
      [stakingManagerOut.utxo],
      serialiseStakingRedeemer({
        CreateStakingPosition: { creatorPkh: pkh.hash },
      }),
    )
    .readFrom([stakingRefScriptUtxo])
    .pay.ToContract(
      stakingManagerOut.utxo.address,
      {
        kind: 'inline',
        value: serialiseStakingDatum(newStakingManagerDatum),
      },
      stakingManagerOut.utxo.assets,
    )
    .readFrom([stakingTokenPolicyRefScriptUtxo])
    .mintAssets(
      {
        [stakingToken]: 1n,
      },
      Data.void(),
    )
    .pay.ToContract(
      stakingManagerOut.utxo.address,
      {
        kind: 'inline',
        value: serialiseStakingDatum(stakingPositionDatum),
      },
      {
        [stakingToken]: 1n,
        [indyToken]: amount,
      },
    )
    .addSignerKey(pkh.hash);
}

export async function adjustStakingPosition(
  stakingPositionRef: OutRef,
  amount: bigint,
  params: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
  stakingManagerRef?: OutRef,
): Promise<TxBuilder> {
  const network = lucid.config().network!;
  const currentTime = slotToUnixTime(network, currentSlot) - 120 * ONE_SECOND;

  const stakingPositionOut = await findStakingPositionByOutRef(
    stakingPositionRef,
    lucid,
  );
  const stakingManagerOut = stakingManagerRef
    ? await findStakingManagerByOutRef(stakingManagerRef, lucid)
    : await findStakingManager(params, lucid);

  const stakingRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(params.scriptReferences.stakingValidatorRef),
    ]),
    (_) => new Error('Expected a single staking Ref Script UTXO'),
  );

  const indyToken =
    params.stakingParams.indyToken[0].unCurrencySymbol +
    fromText(params.stakingParams.indyToken[1].unTokenName);

  const existingIndyAmount = stakingPositionOut.utxo.assets[indyToken] ?? 0n;
  const currentSnapshotAda =
    stakingManagerOut.datum.managerSnapshot.snapshotAda;
  const oldSnapshotAda = stakingPositionOut.datum.positionSnapshot.snapshotAda;
  const adaReward =
    ((currentSnapshotAda - oldSnapshotAda) * existingIndyAmount) /
    rewardSnapshotPrecision;

  const newLockedAmount = updateStakingLockedAmount(
    stakingPositionOut.datum.lockedAmount,
    BigInt(currentTime),
  );

  return lucid
    .newTx()
    .validFrom(currentTime)
    .readFrom([stakingRefScriptUtxo])
    .collectFrom(
      [stakingPositionOut.utxo],
      serialiseStakingRedeemer({
        AdjustStakedAmount: { adjustAmount: amount },
      }),
    )
    .collectFrom(
      [stakingManagerOut.utxo],
      serialiseStakingRedeemer('UpdateTotalStake'),
    )
    .pay.ToContract(
      stakingManagerOut.utxo.address,
      {
        kind: 'inline',
        value: serialiseStakingDatum({
          ...stakingManagerOut.datum,
          totalStake: stakingManagerOut.datum.totalStake + amount,
        }),
      },
      addAssets(stakingManagerOut.utxo.assets, mkLovelacesOf(-adaReward)),
    )
    .pay.ToContract(
      stakingPositionOut.utxo.address,
      {
        kind: 'inline',
        value: serialiseStakingDatum({
          ...stakingPositionOut.datum,
          lockedAmount: newLockedAmount,
        }),
      },
      addAssets(
        stakingPositionOut.utxo.assets,
        mkAssetsOf(
          {
            currencySymbol: params.stakingParams.indyToken[0].unCurrencySymbol,
            tokenName: fromText(params.stakingParams.indyToken[1].unTokenName),
          },
          amount,
        ),
      ),
    )
    .addSignerKey(toHex(stakingPositionOut.datum.owner));
}

export async function closeStakingPosition(
  stakingPositionRef: OutRef,
  params: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
  stakingManagerRef?: OutRef,
): Promise<TxBuilder> {
  const network = lucid.config().network!;
  const currentTime = slotToUnixTime(network, currentSlot) - ONE_SECOND;

  const stakingPositionOut = await findStakingPositionByOutRef(
    stakingPositionRef,
    lucid,
  );
  const stakingManagerOut = stakingManagerRef
    ? await findStakingManagerByOutRef(stakingManagerRef, lucid)
    : await findStakingManager(params, lucid);

  const stakingRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(params.scriptReferences.stakingValidatorRef),
    ]),
    (_) => new Error('Expected a single staking Ref Script UTXO'),
  );
  const stakingTokenPolicyRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        params.scriptReferences.authTokenPolicies.stakingTokenRef,
      ),
    ]),
    (_) => new Error('Expected a single staking token policy Ref Script UTXO'),
  );

  const stakingToken =
    params.stakingParams.stakingToken[0].unCurrencySymbol +
    fromText(params.stakingParams.stakingToken[1].unTokenName);
  const indyToken =
    params.stakingParams.indyToken[0].unCurrencySymbol +
    fromText(params.stakingParams.indyToken[1].unTokenName);

  const existingIndyAmount = stakingPositionOut.utxo.assets[indyToken] ?? 0n;
  const currentSnapshotAda =
    stakingManagerOut.datum.managerSnapshot.snapshotAda;
  const oldSnapshotAda = stakingPositionOut.datum.positionSnapshot.snapshotAda;
  const adaReward =
    ((currentSnapshotAda - oldSnapshotAda) * existingIndyAmount) /
    (1000000n * 1000000n);

  return lucid
    .newTx()
    .validFrom(currentTime)
    .readFrom([stakingRefScriptUtxo, stakingTokenPolicyRefScriptUtxo])
    .collectFrom([stakingPositionOut.utxo], serialiseStakingRedeemer('Unstake'))
    .collectFrom(
      [stakingManagerOut.utxo],
      serialiseStakingRedeemer('UpdateTotalStake'),
    )
    .pay.ToContract(
      stakingManagerOut.utxo.address,
      {
        kind: 'inline',
        value: serialiseStakingDatum({
          ...stakingManagerOut.datum,
          totalStake: stakingManagerOut.datum.totalStake - existingIndyAmount,
        }),
      },
      addAssets(stakingManagerOut.utxo.assets, mkLovelacesOf(-adaReward)),
    )
    .mintAssets(
      {
        [stakingToken]: -1n,
      },
      Data.void(),
    )
    .addSignerKey(toHex(stakingPositionOut.datum.owner));
}

const MIN_UTXO_AMOUNT = 2_000_000n;

export async function distributeAda(
  stakingManagerRef: OutRef,
  collectorRefs: OutRef[],
  params: SystemParams,
  lucid: LucidEvolution,
): Promise<TxBuilder> {
  const [stakingManagerUtxo] = await lucid.utxosByOutRef([stakingManagerRef]);
  const stakingManagerDatum = parseStakingManagerDatum(
    getInlineDatumOrThrow(stakingManagerUtxo),
  );
  const collectorUtxos = (await lucid.utxosByOutRef(collectorRefs))
    .filter((utxo) => utxo.datum && utxo.datum === Data.void())
    .filter((utxo) => utxo.assets.lovelace > MIN_UTXO_AMOUNT);

  if (collectorUtxos.length === 0) {
    throw new Error('No available collectors found');
  }

  const adaRewardCollected = collectorUtxos.reduce(
    (acc, utxo) => acc + utxo.assets.lovelace - MIN_UTXO_AMOUNT,
    0n,
  );
  const newSnapshot = distributeReward(
    stakingManagerDatum.managerSnapshot.snapshotAda,
    adaRewardCollected,
    stakingManagerDatum.totalStake,
  );

  const stakingRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(params.scriptReferences.stakingValidatorRef),
    ]),
    (_) => new Error('Expected a single staking Ref Script UTXO'),
  );

  const collectorRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(params.scriptReferences.collectorValidatorRef),
    ]),
    (_) => new Error('Expected a single staking Ref Script UTXO'),
  );

  const tx = lucid
    .newTx()
    .readFrom([stakingRefScriptUtxo, collectorRefScriptUtxo])
    .collectFrom([stakingManagerUtxo], serialiseStakingRedeemer('Distribute'))
    .collectFrom(
      collectorUtxos,
      serialiseCollectorRedeemer('DistributeToStakers'),
    )
    .pay.ToContract(
      stakingManagerUtxo.address,
      {
        kind: 'inline',
        value: serialiseStakingDatum({
          ...stakingManagerDatum,
          managerSnapshot: { snapshotAda: newSnapshot },
        }),
      },
      addAssets(stakingManagerUtxo.assets, mkLovelacesOf(adaRewardCollected)),
    );

  for (const collectorUtxo of collectorUtxos) {
    tx.pay.ToContract(
      collectorUtxo.address,
      { kind: 'inline', value: Data.void() },
      mkLovelacesOf(MIN_UTXO_AMOUNT),
    );
  }

  return tx;
}
