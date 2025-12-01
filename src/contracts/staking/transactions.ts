import {
  Constr,
  Data,
  fromHex,
  fromText,
  LucidEvolution,
  OutRef,
  TxBuilder,
} from '@lucid-evolution/lucid';
import {
  fromSystemParamsScriptRef,
  SystemParams,
} from '../../types/system-params';
import { addrDetails } from '../../utils/lucid-utils';
import { StakingHelpers, updateStakingLockedAmount } from './helpers';
import {
  serialiseStakingDatum,
  StakingManager,
  StakingPosition,
} from './types-new';
import { matchSingle } from '../../utils/utils';

export async function openStakingPosition(
  amount: bigint,
  params: SystemParams,
  lucid: LucidEvolution,
  stakingManagerRef?: OutRef,
): Promise<TxBuilder> {
  const [pkh, _] = await addrDetails(lucid);

  const stakingManagerOut = stakingManagerRef
    ? await StakingHelpers.findStakingManagerByOutRef(stakingManagerRef, lucid)
    : await StakingHelpers.findStakingManager(params, lucid);

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
    .collectFrom([stakingManagerOut.utxo], Data.to(new Constr(0, [pkh.hash])))
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
  stakingManagerRef?: OutRef,
): Promise<TxBuilder> {
  const [pkh, _] = await addrDetails(lucid);
  const now = Date.now();

  const stakingPositionOut = await StakingHelpers.findStakingPositionByOutRef(
    stakingPositionRef,
    lucid,
  );
  const stakingManagerOut = stakingManagerRef
    ? await StakingHelpers.findStakingManagerByOutRef(stakingManagerRef, lucid)
    : await StakingHelpers.findStakingManager(params, lucid);

  const stakingRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(params.scriptReferences.stakingValidatorRef),
    ]),
    (_) => new Error('Expected a single staking Ref Script UTXO'),
  );

  const stakingToken =
    params.stakingParams.stakingToken[0].unCurrencySymbol +
    fromText(params.stakingParams.stakingToken[1].unTokenName);
  const stakingManagerToken =
    params.stakingParams.stakingManagerNFT[0].unCurrencySymbol +
    fromText(params.stakingParams.stakingManagerNFT[1].unTokenName);
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

  const newLockedAmount = updateStakingLockedAmount(
    stakingPositionOut.datum.lockedAmount,
    BigInt(now),
  );

  return lucid
    .newTx()
    .validFrom(Date.now())
    .readFrom([stakingRefScriptUtxo])
    .collectFrom([stakingPositionOut.utxo], Data.to(new Constr(3, [amount])))
    .collectFrom([stakingManagerOut.utxo], Data.to(new Constr(1, [])))
    .pay.ToContract(
      stakingManagerOut.utxo.address,
      {
        kind: 'inline',
        value: serialiseStakingDatum({
          ...stakingManagerOut.datum,
          totalStake: stakingManagerOut.datum.totalStake + amount,
        }),
      },
      {
        lovelace: stakingManagerOut.utxo.assets.lovelace - adaReward,
        [stakingManagerToken]: 1n,
      },
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
      {
        [stakingToken]: 1n,
        [indyToken]: stakingPositionOut.utxo.assets[indyToken] + amount,
      },
    )
    .addSignerKey(pkh.hash);
}

export async function closeStakingPosition(
  stakingPositionRef: OutRef,
  params: SystemParams,
  lucid: LucidEvolution,
  stakingManagerRef?: OutRef,
): Promise<TxBuilder> {
  const [pkh, _] = await addrDetails(lucid);

  const stakingPositionOut = await StakingHelpers.findStakingPositionByOutRef(
    stakingPositionRef,
    lucid,
  );
  const stakingManagerOut = stakingManagerRef
    ? await StakingHelpers.findStakingManagerByOutRef(stakingManagerRef, lucid)
    : await StakingHelpers.findStakingManager(params, lucid);

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
  const stakingManagerToken =
    params.stakingParams.stakingManagerNFT[0].unCurrencySymbol +
    fromText(params.stakingParams.stakingManagerNFT[1].unTokenName);
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
    .validFrom(Date.now())
    .readFrom([stakingRefScriptUtxo, stakingTokenPolicyRefScriptUtxo])
    .collectFrom([stakingPositionOut.utxo], Data.to(new Constr(4, [])))
    .collectFrom([stakingManagerOut.utxo], Data.to(new Constr(1, [])))
    .pay.ToContract(
      stakingManagerOut.utxo.address,
      {
        kind: 'inline',
        value: serialiseStakingDatum({
          ...stakingManagerOut.datum,
          totalStake: stakingManagerOut.datum.totalStake - existingIndyAmount,
        }),
      },
      {
        lovelace: stakingManagerOut.utxo.assets.lovelace - adaReward,
        [stakingManagerToken]: 1n,
      },
    )
    .mintAssets(
      {
        [stakingToken]: -1n,
      },
      Data.void(),
    )
    .addSignerKey(pkh.hash);
}
