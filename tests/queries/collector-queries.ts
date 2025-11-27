import { LucidEvolution, UTxO } from '@lucid-evolution/lucid';
import { createScriptAddress, getRandomElement } from '../../src';
import { option as O, function as F } from 'fp-ts';

export async function findAllCollectors(
  lucid: LucidEvolution,
  collectorScriptHash: string,
): Promise<UTxO[]> {
  return lucid.utxosAt(
    createScriptAddress(lucid.config().network!, collectorScriptHash),
  );
}

export async function findRandomCollector(
  lucid: LucidEvolution,
  collectorScriptHash: string,
): Promise<UTxO> {
  const allCollectors = await findAllCollectors(lucid, collectorScriptHash);

  return F.pipe(
    O.fromNullable(getRandomElement(allCollectors)),
    O.match(() => {
      throw new Error('Expected some poll shard UTXOs.');
    }, F.identity),
  );
}
