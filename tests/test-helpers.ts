import { Emulator, LucidEvolution, TxBuilder } from '@lucid-evolution/lucid';

export type LucidContext = {
  lucid: LucidEvolution;
  users: any;
  emulator: Emulator;
};

export async function runAndAwaitTx(
  lucid: LucidEvolution,
  transaction: Promise<TxBuilder>,
): Promise<string> {
  const txHash = await transaction
    .then((tx) => tx.complete())
    .then((tx) => tx.sign.withWallet().complete())
    .then((tx) => tx.submit());

  await lucid.awaitTx(txHash);
  return txHash;
}
