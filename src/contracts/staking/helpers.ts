import {
  fromText,
  OutRef,
  UTxO,
  validatorToScriptHash,
} from '@lucid-evolution/lucid';
import { LucidEvolution } from '@lucid-evolution/lucid';
import { SystemParams } from '../../types/system-params';
import {
  parseStakingManagerDatum,
  parseStakingPositionOrThrow,
  StakingManager,
  StakingPosition,
  StakingPosLockedAmt,
} from './types-new';
import { createScriptAddress } from '../../utils/lucid-utils';
import { mkStakingValidatorFromSP } from './scripts';

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
  return stakingPosLockedAmt.filter(
    ([_, { votingEnd }]) => votingEnd > currentTime,
  );
}

export function findStakingManagerByOutRef(
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

export function findStakingManager(
  params: SystemParams,
  lucid: LucidEvolution,
): Promise<StakingManagerOutput> {
  return lucid
    .utxosAtWithUnit(
      createScriptAddress(
        lucid.config().network!,
        validatorToScriptHash(mkStakingValidatorFromSP(params.stakingParams)),
      ),
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

export function findStakingPositionByOutRef(
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
