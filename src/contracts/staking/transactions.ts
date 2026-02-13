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
import {
  addrDetails,
  getInlineDatumOrThrow,
  resolveUtxo,
  UTxOOrOutRef,
} from '../../utils/lucid-utils';
import {
  distributeReward,
  rewardSnapshotPrecision,
  updateStakingLockedAmount,
} from './helpers';
import {
  parseStakingManagerDatum,
  parseStakingPositionOrThrow,
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
  stakingManager: UTxOOrOutRef,
): Promise<TxBuilder> {
  const [pkh, _] = await addrDetails(lucid);

  const stakingManagerUtxo = await resolveUtxo(
    stakingManager,
    lucid,
    'Expected a single staking manager UTXO',
  );
  const stakingManagerDatum = parseStakingManagerDatum(
    getInlineDatumOrThrow(stakingManagerUtxo),
  );

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
    totalStake: stakingManagerDatum.totalStake + amount,
    managerSnapshot: {
      snapshotAda: stakingManagerDatum.managerSnapshot.snapshotAda,
    },
  };

  const stakingPositionDatum: StakingPosition = {
    owner: fromHex(pkh.hash),
    lockedAmount: new Map([]),
    positionSnapshot: {
      snapshotAda: stakingManagerDatum.managerSnapshot.snapshotAda,
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
      [stakingManagerUtxo],
      serialiseStakingRedeemer({
        CreateStakingPosition: { creatorPkh: pkh.hash },
      }),
    )
    .readFrom([stakingRefScriptUtxo])
    .pay.ToContract(
      stakingManagerUtxo.address,
      {
        kind: 'inline',
        value: serialiseStakingDatum(newStakingManagerDatum),
      },
      stakingManagerUtxo.assets,
    )
    .readFrom([stakingTokenPolicyRefScriptUtxo])
    .mintAssets(
      {
        [stakingToken]: 1n,
      },
      Data.void(),
    )
    .pay.ToContract(
      stakingManagerUtxo.address,
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
  stakingPosition: UTxOOrOutRef,
  amount: bigint,
  params: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
  stakingManager: UTxOOrOutRef,
): Promise<TxBuilder> {
  const network = lucid.config().network!;
  const currentTime = slotToUnixTime(network, currentSlot) - 120 * ONE_SECOND;

  const stakingPositionUtxo = await resolveUtxo(
    stakingPosition,
    lucid,
    'Expected a single staking position UTXO',
  );
  const stakingPositionDatum = parseStakingPositionOrThrow(
    getInlineDatumOrThrow(stakingPositionUtxo),
  );

  const stakingManagerUtxo = await resolveUtxo(
    stakingManager,
    lucid,
    'Expected a single staking manager UTXO',
  );
  const stakingManagerDatum = parseStakingManagerDatum(
    getInlineDatumOrThrow(stakingManagerUtxo),
  );

  const stakingRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(params.scriptReferences.stakingValidatorRef),
    ]),
    (_) => new Error('Expected a single staking Ref Script UTXO'),
  );

  const indyToken =
    params.stakingParams.indyToken[0].unCurrencySymbol +
    fromText(params.stakingParams.indyToken[1].unTokenName);

  const existingIndyAmount = stakingPositionUtxo.assets[indyToken] ?? 0n;
  const currentSnapshotAda = stakingManagerDatum.managerSnapshot.snapshotAda;
  const oldSnapshotAda = stakingPositionDatum.positionSnapshot.snapshotAda;
  const adaReward =
    ((currentSnapshotAda - oldSnapshotAda) * existingIndyAmount) /
    rewardSnapshotPrecision;

  const newLockedAmount = updateStakingLockedAmount(
    stakingPositionDatum.lockedAmount,
    BigInt(currentTime),
  );

  return lucid
    .newTx()
    .validFrom(currentTime)
    .readFrom([stakingRefScriptUtxo])
    .collectFrom(
      [stakingPositionUtxo],
      serialiseStakingRedeemer({
        AdjustStakedAmount: { adjustAmount: amount },
      }),
    )
    .collectFrom(
      [stakingManagerUtxo],
      serialiseStakingRedeemer('UpdateTotalStake'),
    )
    .pay.ToContract(
      stakingManagerUtxo.address,
      {
        kind: 'inline',
        value: serialiseStakingDatum({
          ...stakingManagerDatum,
          totalStake: stakingManagerDatum.totalStake + amount,
        }),
      },
      addAssets(stakingManagerUtxo.assets, mkLovelacesOf(-adaReward)),
    )
    .pay.ToContract(
      stakingPositionUtxo.address,
      {
        kind: 'inline',
        value: serialiseStakingDatum({
          ...stakingPositionDatum,
          lockedAmount: newLockedAmount,
          positionSnapshot: stakingManagerDatum.managerSnapshot,
        }),
      },
      addAssets(
        stakingPositionUtxo.assets,
        mkAssetsOf(
          {
            currencySymbol: params.stakingParams.indyToken[0].unCurrencySymbol,
            tokenName: fromText(params.stakingParams.indyToken[1].unTokenName),
          },
          amount,
        ),
      ),
    )
    .addSignerKey(toHex(stakingPositionDatum.owner));
}

export async function closeStakingPosition(
  stakingPosition: UTxOOrOutRef,
  params: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
  stakingManager: UTxOOrOutRef,
): Promise<TxBuilder> {
  const network = lucid.config().network!;
  const currentTime = slotToUnixTime(network, currentSlot) - ONE_SECOND;

  const stakingPositionUtxo = await resolveUtxo(
    stakingPosition,
    lucid,
    'Expected a single staking position UTXO',
  );
  const stakingPositionDatum = parseStakingPositionOrThrow(
    getInlineDatumOrThrow(stakingPositionUtxo),
  );

  const stakingManagerUtxo = await resolveUtxo(
    stakingManager,
    lucid,
    'Expected a single staking manager UTXO',
  );
  const stakingManagerDatum = parseStakingManagerDatum(
    getInlineDatumOrThrow(stakingManagerUtxo),
  );

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

  const existingIndyAmount = stakingPositionUtxo.assets[indyToken] ?? 0n;
  const currentSnapshotAda = stakingManagerDatum.managerSnapshot.snapshotAda;
  const oldSnapshotAda = stakingPositionDatum.positionSnapshot.snapshotAda;
  const adaReward =
    ((currentSnapshotAda - oldSnapshotAda) * existingIndyAmount) /
    (1000000n * 1000000n);

  return lucid
    .newTx()
    .validFrom(currentTime)
    .readFrom([stakingRefScriptUtxo, stakingTokenPolicyRefScriptUtxo])
    .collectFrom([stakingPositionUtxo], serialiseStakingRedeemer('Unstake'))
    .collectFrom(
      [stakingManagerUtxo],
      serialiseStakingRedeemer('UpdateTotalStake'),
    )
    .pay.ToContract(
      stakingManagerUtxo.address,
      {
        kind: 'inline',
        value: serialiseStakingDatum({
          ...stakingManagerDatum,
          totalStake: stakingManagerDatum.totalStake - existingIndyAmount,
        }),
      },
      addAssets(stakingManagerUtxo.assets, mkLovelacesOf(-adaReward)),
    )
    .mintAssets(
      {
        [stakingToken]: -1n,
      },
      Data.void(),
    )
    .addSignerKey(toHex(stakingPositionDatum.owner));
}

const MIN_UTXO_AMOUNT = 2_000_000n;

export async function distributeAda(
  stakingManager: UTxOOrOutRef,
  collectorRefs: OutRef[],
  params: SystemParams,
  lucid: LucidEvolution,
): Promise<TxBuilder> {
  const stakingManagerUtxo = await resolveUtxo(
    stakingManager,
    lucid,
    'Expected a single staking manager UTXO',
  );
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
