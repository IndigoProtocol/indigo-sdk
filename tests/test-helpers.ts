import { Emulator, EmulatorAccount, LucidEvolution, TxBuilder } from '@lucid-evolution/lucid';

export type LucidContext = {
  lucid: LucidEvolution;
  users: {[key:string]: EmulatorAccount};
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

export async function runAndAwaitTxBuilder(
  lucid: LucidEvolution,
  transaction: TxBuilder,
): Promise<string> {
  const txHash = await transaction.complete()
    .then((tx) => tx.sign.withWallet().complete())
    .then((tx) => tx.submit());

  await lucid.awaitTx(txHash);
  return txHash;
}
