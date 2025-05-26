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
import { scriptRef } from '../helpers/lucid-utils';
import { _stakingValidator } from '../scripts/staking-validator';
import { StakingDatum } from '../types/indigo/staking';

export class StakingContract {
  static decodeDatum(datum: string): StakingDatum {
    const stakingDatum = Data.from(datum) as any;
    if (stakingDatum.index === 0 && stakingDatum.fields[0].index === 0) {
      const managerDatum = stakingDatum.fields[0].fields;
      return {
        type: 'StakingManager',
        totalStaked: managerDatum[0],
        snapshot: {
          snapshotAda: managerDatum[1].fields[0],
        },
      };
    } else if (stakingDatum.index === 1 && stakingDatum.fields[0].index === 0) {
      const positionDatum = stakingDatum.fields[0].fields;
      const lockedAmount = new Map<bigint, [bigint, bigint]>();
      for (const [key, value] of positionDatum[1] as Map<
        bigint,
        Constr<bigint>
      >) {
        lockedAmount.set(key, [value.fields[0], value.fields[1]]);
      }
      return {
        type: 'StakingPosition',
        owner: positionDatum[0],
        lockedAmount,
        snapshot: {
          snapshotAda: positionDatum[2].fields[0],
        },
      };
    }

    throw 'Invalid Staking Datum provided';
  }

  static encodeDatum(datum: StakingDatum): string {
    if (datum.type === 'StakingManager') {
      return Data.to(
        new Constr(0, [
          new Constr(0, [
            datum.totalStaked,
            new Constr(0, [datum.snapshot.snapshotAda]),
          ]),
        ]),
      );
    } else if (datum.type === 'StakingPosition') {
      const lockedAmount = new Map<bigint, Constr<bigint>>();
      for (const [key, value] of datum.lockedAmount) {
        lockedAmount.set(key, new Constr(0, [value[0], value[1]]));
      }
      return Data.to(
        new Constr(1, [
          new Constr(0, [
            datum.owner,
            lockedAmount,
            new Constr(0, [datum.snapshot.snapshotAda]),
          ]),
        ]),
      );
    }

    throw 'Invalid Staking Datum provided';
  }

  // Staking Validator
  static validator(params: StakingParams): SpendingValidator {
    return {
      type: 'PlutusV2',
      script: applyParamsToScript(_stakingValidator.cborHex, [
        new Constr(0, [
          new Constr(0, [
            params.stakingManagerNFT[0].unCurrencySymbol,
            fromText(params.stakingManagerNFT[1].unTokenName),
          ]),
          new Constr(0, [
            params.stakingToken[0].unCurrencySymbol,
            fromText(params.stakingToken[1].unTokenName),
          ]),
          new Constr(0, [
            params.indyToken[0].unCurrencySymbol,
            fromText(params.indyToken[1].unTokenName),
          ]),
          new Constr(0, [
            params.pollToken[0].unCurrencySymbol,
            fromText(params.pollToken[1].unTokenName),
          ]),
          new Constr(0, [
            params.versionRecordToken[0].unCurrencySymbol,
            fromText(params.versionRecordToken[1].unTokenName),
          ]),
          params.collectorValHash,
        ]),
      ]),
    };
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
}
