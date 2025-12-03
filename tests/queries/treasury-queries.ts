import { LucidEvolution, ScriptHash, UTxO } from '@lucid-evolution/lucid';
import { createScriptAddress, getRandomElement } from '../../src';
import { option as O, function as F } from 'fp-ts';

export async function findRandomTreasuryUtxo(
  lucid: LucidEvolution,
  treasuryScriptHash: ScriptHash,
): Promise<UTxO> {
  const treasuryUtxos = await lucid.utxosAt(
    createScriptAddress(lucid.config().network!, treasuryScriptHash),
  );

  return F.pipe(
    O.fromNullable(getRandomElement(treasuryUtxos)),
    O.match(() => {
      throw new Error('Expected some treasury UTXOs.');
    }, F.identity),
  );
}
