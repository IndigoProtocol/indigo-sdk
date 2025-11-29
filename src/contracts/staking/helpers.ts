import { fromText, OutRef, UTxO } from '@lucid-evolution/lucid';
import { LucidEvolution } from '@lucid-evolution/lucid';
import { StakingContract } from './transactions';
import { SystemParams } from '../../types/system-params';
import {
  parseStakingManagerDatum,
  parseStakingPositionOrThrow,
  StakingManager,
  StakingPosition,
  StakingPosLockedAmt,
} from './types-new';

export type StakingPositionOutput = {
  utxo: UTxO;
  datum: StakingPosition;
};
export type StakingManagerOutput = { utxo: UTxO; datum: StakingManager };

/**
 * Update the staking position locked amount. In case proposal's voting finished, unlock the amount.
 */
export function updateStakingLockedAmount(
  stakingPosLockedAmt: StakingPosLockedAmt,
  currentTime: bigint,
): StakingPosLockedAmt {
  return new Map(
    stakingPosLockedAmt
      .entries()
      .filter(([_, { votingEnd }]) => votingEnd > currentTime),
  );
}

export class StakingHelpers {
  static async findStakingManagerByOutRef(
    stakingManagerRef: OutRef,
    lucid: LucidEvolution,
  ): Promise<StakingManagerOutput> {
    return lucid
      .utxosByOutRef([stakingManagerRef])
      .then((utxos) =>
        utxos
          .map((utxo) => {
            if (!utxo.datum) return undefined;
            const datum = parseStakingManagerDatum(utxo.datum);
            return { utxo, datum };
          })
          .find((utxo) => utxo !== undefined),
      )
      .then((result) => {
        if (!result)
          throw new Error(
            'Unable to locate Staking Manager by output reference.',
          );
        return result;
      });
  }

  static async findStakingManager(
    params: SystemParams,
    lucid: LucidEvolution,
  ): Promise<StakingManagerOutput> {
    return lucid
      .utxosAtWithUnit(
        StakingContract.address(params.stakingParams, lucid),
        params.stakingParams.stakingManagerNFT[0].unCurrencySymbol +
          fromText(params.stakingParams.stakingManagerNFT[1].unTokenName),
      )
      .then((utxos) =>
        utxos
          .map((utxo) => {
            if (!utxo.datum) return undefined;
            const datum = parseStakingManagerDatum(utxo.datum);
            return { utxo, datum };
          })
          .find((utxo) => utxo !== undefined),
      )
      .then((result) => {
        if (!result)
          throw new Error(
            'Unable to locate Staking Manager by output reference.',
          );
        return result;
      });
  }

  static async findStakingPositionByOutRef(
    stakingPositionRef: OutRef,
    lucid: LucidEvolution,
  ): Promise<StakingPositionOutput> {
    return lucid
      .utxosByOutRef([stakingPositionRef])
      .then((utxos) =>
        utxos
          .map((utxo) => {
            if (!utxo.datum) return undefined;
            const datum = parseStakingPositionOrThrow(utxo.datum);
            return { utxo, datum };
          })
          .find((utxo) => utxo !== undefined),
      )
      .then((result) => {
        if (!result)
          throw new Error(
            'Unable to locate Staking Position by output reference.',
          );
        return result;
      });
  }
}
