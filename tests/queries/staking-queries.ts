import {
  LucidEvolution,
  ScriptHash,
  toHex,
  UTxO,
} from '@lucid-evolution/lucid';
import { createScriptAddress } from '../../src/utils/lucid-utils';
import { AssetClass } from '../../src/types/generic';
import { assetClassToUnit } from '../../src/utils/value-helpers';
import { matchSingle } from '../../src';
import { option as O, array as A, function as F } from 'fp-ts';
import {
  parseStakingPosition,
  StakingPosition,
} from '../../src/contracts/staking/types-new';

export async function findStakingPosition(
  lucid: LucidEvolution,
  stakingScriptHash: ScriptHash,
  stakingPositionNft: AssetClass,
  owner: string,
): Promise<{ utxo: UTxO; datum: StakingPosition }> {
  const network = lucid.config().network!;

  const stakingUtxos = await lucid.utxosAtWithUnit(
    createScriptAddress(network, stakingScriptHash),
    assetClassToUnit(stakingPositionNft),
  );

  return matchSingle(
    F.pipe(
      stakingUtxos.map((utxo) =>
        F.pipe(
          O.fromNullable(utxo.datum),
          O.flatMap(parseStakingPosition),
          O.flatMap((datum) => {
            if (toHex(datum.owner) === owner) {
              return O.some({ utxo, datum: datum });
            } else {
              return O.none;
            }
          }),
        ),
      ),
      A.compact,
    ),
    (res) =>
      new Error(
        'Expected a single Staking Position UTXO.: ' + JSON.stringify(res),
      ),
  );
}
