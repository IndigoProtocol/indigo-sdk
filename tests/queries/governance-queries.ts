import { LucidEvolution, ScriptHash, UTxO } from '@lucid-evolution/lucid';
import { createScriptAddress } from '../../src/helpers/lucid-utils';
import { AssetClass } from '../../src/types/generic';
import { assetClassToUnit } from '../../src/helpers/value-helpers';
import { GovDatum, matchSingle, parseGovDatum } from '../../src';
import { option as O, array as A, function as F } from 'fp-ts';

export async function findGov(
  lucid: LucidEvolution,
  govScriptHash: ScriptHash,
  govNft: AssetClass,
): Promise<{
  utxo: UTxO;
  datum: GovDatum;
}> {
  const govUtxos = await lucid.utxosAtWithUnit(
    createScriptAddress(lucid.config().network!, govScriptHash),
    assetClassToUnit(govNft),
  );

  return matchSingle(
    F.pipe(
      govUtxos.map((utxo) =>
        F.pipe(
          O.fromNullable(utxo.datum),
          O.flatMap(parseGovDatum),
          O.map((datum) => ({ utxo, datum: datum })),
        ),
      ),
      A.compact,
    ),
    (res) => new Error('Expected a single Gov UTXO.: ' + JSON.stringify(res)),
  );
}
