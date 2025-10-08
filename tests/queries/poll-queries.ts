import { LucidEvolution, ScriptHash, UTxO } from '@lucid-evolution/lucid';
import {
  parsePollManager,
  parsePollShard,
  PollManagerContent,
  PollShardContent,
} from '../../src/types/indigo/poll';
import {
  AssetClass,
  matchSingle,
  createScriptAddress,
  getRandomElement,
} from '../../src';
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

export async function findRandomPollShard(
  lucid: LucidEvolution,
  pollShardScriptHash: string,
  pollShardNft: AssetClass,
  pollId: bigint,
): Promise<{ utxo: UTxO; datum: PollShardContent }> {
  const pollShardUtxos = await lucid.utxosAtWithUnit(
    createScriptAddress(lucid.config().network!, pollShardScriptHash),
    assetClassToUnit(pollShardNft),
  );

  const pollShardOuts = F.pipe(
    pollShardUtxos.map((utxo) =>
      F.pipe(
        O.fromNullable(utxo.datum),
        O.flatMap(parsePollShard),
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
  );

  return F.pipe(
    O.fromNullable(getRandomElement(pollShardOuts)),
    O.match(() => {
      throw new Error('Expected some poll shard UTXOs.');
    }, F.identity),
  );
}
