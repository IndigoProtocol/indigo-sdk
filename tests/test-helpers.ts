import { LucidEvolution, TxBuilder } from '@lucid-evolution/lucid';

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
