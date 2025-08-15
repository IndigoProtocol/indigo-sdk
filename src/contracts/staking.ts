import {
  Address,
  applyParamsToScript,
  Constr,
  Data,
  fromText,
  LucidEvolution,
  OutRef,
  SpendingValidator,
  toText,
  TxBuilder,
  UTxO,
  validatorToAddress,
  validatorToScriptHash,
} from '@lucid-evolution/lucid';
import {
  ScriptReferences,
  StakingParams,
  SystemParams,
} from '../types/system-params';
import { addrDetails, scriptRef } from '../helpers/lucid-utils';
import { _stakingValidator } from '../scripts/staking-validator';
import { StakingDatum } from '../types/indigo/staking';
import { StakingHelpers } from '../helpers/staking-helpers';

export class StakingContract {
  static async openPosition(
    amount: bigint,
    params: SystemParams,
    lucid: LucidEvolution,
    stakingManagerRef?: OutRef,
  ): Promise<TxBuilder> {
    const [pkh, _] = await addrDetails(lucid);

    const stakingManagerOut = stakingManagerRef
      ? await StakingHelpers.findStakingManagerByOutRef(
          stakingManagerRef,
          lucid,
        )
      : await StakingHelpers.findStakingManager(params, lucid);
    const stakingScriptRef = await StakingContract.scriptRef(
      params.scriptReferences,
      lucid,
    );
    const stakingTokenScriptRefUtxo =
      await StakingContract.stakingTokenScriptRef(
        params.scriptReferences,
        lucid,
      );

    const newStakingManagerDatum: StakingDatum = {
      type: 'StakingManager',
      totalStaked: stakingManagerOut.datum.totalStaked + amount,
      snapshot: {
        snapshotAda: stakingManagerOut.datum.snapshot.snapshotAda,
      },
    };

    const stakingPositionDatum: StakingDatum = {
      type: 'StakingPosition',
      owner: pkh.hash,
      lockedAmount: new Map([]),
      snapshot: {
        snapshotAda: stakingManagerOut.datum.snapshot.snapshotAda,
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
      .collectFrom([stakingScriptRef])
      .pay.ToContract(
        stakingManagerOut.utxo.address,
        {
          kind: 'inline',
          value: StakingContract.encodeDatum(newStakingManagerDatum),
        },
        stakingManagerOut.utxo.assets,
      )
      .collectFrom([stakingTokenScriptRefUtxo])
      .mintAssets(
        {
          [stakingToken]: 1n,
        },
        Data.void(),
      )
      .pay.ToContract(
        StakingContract.address(params.stakingParams, lucid),
        {
          kind: 'inline',
          value: StakingContract.encodeDatum(stakingPositionDatum),
        },
        {
          [stakingToken]: 1n,
          [indyToken]: amount,
        },
      )
      .addSignerKey(pkh.hash);
  }

  static async adjustPosition(
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
      ? await StakingHelpers.findStakingManagerByOutRef(
          stakingManagerRef,
          lucid,
        )
      : await StakingHelpers.findStakingManager(params, lucid);

    const stakingScriptRef = await StakingContract.scriptRef(
      params.scriptReferences,
      lucid,
    );

    const stakingToken =
      params.stakingParams.stakingToken[0].unCurrencySymbol +
      fromText(params.stakingParams.stakingToken[1].unTokenName);
    const indyToken =
      params.stakingParams.indyToken[0].unCurrencySymbol +
      fromText(params.stakingParams.indyToken[1].unTokenName);

    const existingIndyAmount = stakingPositionOut.utxo.assets[indyToken] ?? 0n;
    const currentSnapshotAda = stakingManagerOut.datum.snapshot.snapshotAda;
    const oldSnapshotAda = stakingPositionOut.datum.snapshot.snapshotAda;
    const adaReward =
      ((currentSnapshotAda - oldSnapshotAda) * existingIndyAmount) /
      (1000000n * 1000000n);

    const newLockedAmount = new Map<bigint, [bigint, bigint]>();
    for (const [key, value] of stakingPositionOut.datum.lockedAmount) {
      if (value[1] > now) {
        newLockedAmount.set(key, [value[0], value[1]]);
      }
    }

    return lucid
      .newTx()
      .validFrom(Date.now())
      .collectFrom([stakingScriptRef])
      .collectFrom([stakingPositionOut.utxo], Data.to(new Constr(3, [amount])))
      .collectFrom([stakingManagerOut.utxo], Data.to(new Constr(1, [])))
      .pay.ToContract(
        stakingManagerOut.utxo.address,
        {
          kind: 'inline',
          value: StakingContract.encodeDatum({
            ...stakingManagerOut.datum,
            totalStaked: stakingManagerOut.datum.totalStaked + amount,
          }),
        },
        {
          lovelace: stakingManagerOut.utxo.assets.lovelace - adaReward,
        },
      )
      .pay.ToContract(
        stakingPositionOut.utxo.address,
        {
          kind: 'inline',
          value: StakingContract.encodeDatum({
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

  static async closePosition(
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
      ? await StakingHelpers.findStakingManagerByOutRef(
          stakingManagerRef,
          lucid,
        )
      : await StakingHelpers.findStakingManager(params, lucid);

    const stakingScriptRef = await StakingContract.scriptRef(
      params.scriptReferences,
      lucid,
    );
    const stakingTokenScriptRefUtxo =
      await StakingContract.stakingTokenScriptRef(
        params.scriptReferences,
        lucid,
      );

    const stakingToken =
      params.stakingParams.stakingToken[0].unCurrencySymbol +
      fromText(params.stakingParams.stakingToken[1].unTokenName);
    const indyToken =
      params.stakingParams.indyToken[0].unCurrencySymbol +
      fromText(params.stakingParams.indyToken[1].unTokenName);

    const existingIndyAmount = stakingPositionOut.utxo.assets[indyToken] ?? 0n;
    const currentSnapshotAda = stakingManagerOut.datum.snapshot.snapshotAda;
    const oldSnapshotAda = stakingPositionOut.datum.snapshot.snapshotAda;
    const adaReward =
      ((currentSnapshotAda - oldSnapshotAda) * existingIndyAmount) /
      (1000000n * 1000000n);

    return lucid
      .newTx()
      .validFrom(Date.now())
      .collectFrom([stakingScriptRef])
      .collectFrom([stakingTokenScriptRefUtxo])
      .collectFrom([stakingPositionOut.utxo], Data.to(new Constr(4, [])))
      .collectFrom([stakingManagerOut.utxo], Data.to(new Constr(1, [])))
      .pay.ToContract(
        stakingManagerOut.utxo.address,
        {
          kind: 'inline',
          value: StakingContract.encodeDatum({
            ...stakingManagerOut.datum,
            totalStaked:
              stakingManagerOut.datum.totalStaked - existingIndyAmount,
          }),
        },
        {
          lovelace: stakingManagerOut.utxo.assets.lovelace - adaReward,
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

 
  

  static validatorHash(params: StakingParams): string {
    return validatorToScriptHash(StakingContract.validator(params));
  }

  static address(params: StakingParams, lucid: LucidEvolution): Address {
    const network = lucid.config().network;
    if (!network) {
      throw new Error('Network configuration is undefined');
    }
    return validatorToAddress(network, StakingContract.validator(params));
  }

  static async scriptRef(
    params: ScriptReferences,
    lucid: LucidEvolution,
  ): Promise<UTxO> {
    return scriptRef(params.stakingValidatorRef, lucid);
  }

  static async stakingTokenScriptRef(
    params: ScriptReferences,
    lucid: LucidEvolution,
  ): Promise<UTxO> {
    return scriptRef(params.authTokenPolicies.stakingTokenRef, lucid);
  }
}
