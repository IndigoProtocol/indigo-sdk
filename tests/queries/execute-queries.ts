import { LucidEvolution, ScriptHash, UTxO } from '@lucid-evolution/lucid';
import {
  AssetClass,
  createScriptAddress,
  ExecuteDatum,
  matchSingle,
  parseExecuteDatum,
} from '../../src';
import { assetClassToUnit } from '../../src/helpers/value-helpers';
import { option as O, array as A, function as F } from 'fp-ts';

export async function findExecute(
  lucid: LucidEvolution,
  executeHash: ScriptHash,
  executeNft: AssetClass,
  upgradeId: bigint,
): Promise<{
  utxo: UTxO;
  datum: ExecuteDatum;
}> {
  const executeUtxos = await lucid.utxosAtWithUnit(
    createScriptAddress(lucid.config().network!, executeHash),
    assetClassToUnit(executeNft),
  );

  return matchSingle(
    F.pipe(
      executeUtxos.map((utxo) =>
        F.pipe(
          O.fromNullable(utxo.datum),
          O.flatMap(parseExecuteDatum),
          O.flatMap((datum) => {
            if (datum.id === upgradeId) {
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
      new Error('Expected a single Execute UTXO.: ' + JSON.stringify(res)),
  );
}
