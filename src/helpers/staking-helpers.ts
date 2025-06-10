import { fromText, OutRef } from '@lucid-evolution/lucid';
import { LucidEvolution } from '@lucid-evolution/lucid';
import { StakingContract } from '../contracts/staking';
import { SystemParams } from '../types/system-params';

export class StakingHelpers {
  static async findStakingManagerByOutRef(
    stakingManagerRef: OutRef,
    lucid: LucidEvolution,
  ) {
    return lucid
      .utxosByOutRef([stakingManagerRef])
      .then((utxos) =>
        utxos
          .map((utxo) => {
            if (!utxo.datum) return undefined;
            const datum = StakingContract.decodeDatum(utxo.datum);
            if (datum.type !== 'StakingManager') return undefined;
            return { utxo, datum };
          })
          .find((utxo) => utxo !== undefined),
      )
      .then((result) => {
        if (!result)
          throw 'Unable to locate Staking Manager by output reference.';
        return result;
      });
  }

  static async findStakingManager(params: SystemParams, lucid: LucidEvolution) {
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
            const datum = StakingContract.decodeDatum(utxo.datum);
            if (datum.type !== 'StakingManager') return undefined;
            return { utxo, datum };
          })
          .find((utxo) => utxo !== undefined),
      )
      .then((result) => {
        if (!result)
          throw 'Unable to locate Staking Manager by output reference.';
        return result;
      });
  }

  static async findStakingPositionByOutRef(
    stakingPositionRef: OutRef,
    lucid: LucidEvolution,
  ) {
    return lucid
      .utxosByOutRef([stakingPositionRef])
      .then((utxos) =>
        utxos
          .map((utxo) => {
            if (!utxo.datum) return undefined;
            const datum = StakingContract.decodeDatum(utxo.datum);
            if (datum.type !== 'StakingPosition') return undefined;
            return { utxo, datum };
          })
          .find((utxo) => utxo !== undefined),
      )
      .then((result) => {
        if (!result)
          throw 'Unable to locate Staking Position by output reference.';
        return result;
      });
  }
}
