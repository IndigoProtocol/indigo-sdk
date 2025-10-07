import { LucidEvolution, ScriptHash, UTxO } from '@lucid-evolution/lucid';
import {
  parsePollManager,
  PollManagerContent,
} from '../../src/types/indigo/poll';
import { AssetClass, matchSingle, createScriptAddress } from '../../src';
import { assetClassToUnit } from '../../src/helpers/value-helpers';
import { option as O, array as A, function as F } from 'fp-ts';

export async function findPollManager(
  lucid: LucidEvolution,
  pollManagerScriptHash: ScriptHash,
  pollManagerNft: AssetClass,
  pollId: bigint,
): Promise<{ utxo: UTxO; datum: PollManagerContent }> {
  const pollManagerUtxos = await lucid.utxosAtWithUnit(
    createScriptAddress(lucid.config().network!, pollManagerScriptHash),
    assetClassToUnit(pollManagerNft),
  );

  return matchSingle(
    F.pipe(
      pollManagerUtxos.map((utxo) =>
        F.pipe(
          O.fromNullable(utxo.datum),
          O.flatMap(parsePollManager),
          O.flatMap((datum) => {
            if (datum.pollId === pollId) {
              return O.some({ utxo, datum: datum });
            } else {
              return O.none;
            }
          }),
        ),
      ),
      A.compact,
    ),
    (res) => new Error('Expected a single Gov UTXO.: ' + JSON.stringify(res)),
  );
}
