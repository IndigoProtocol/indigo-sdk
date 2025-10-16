import { LucidEvolution, UTxO } from '@lucid-evolution/lucid';

export async function getNewUtxosAtAddressAfterAction<T>(
  lucid: LucidEvolution,
  address: string,
  action: () => Promise<T>,
): Promise<[T, UTxO[]]> {
  const utxosBefore = await lucid.utxosAt(address);

  const res = await action();

  const utxosAfter = await lucid.utxosAt(address);

  return [
    res,
    utxosAfter.filter(
      (utxo) =>
        utxosBefore.filter(
          (oldUtxo) =>
            utxo.txHash === oldUtxo.txHash &&
            utxo.outputIndex === oldUtxo.outputIndex,
        ).length === 0,
    ),
  ];
}
