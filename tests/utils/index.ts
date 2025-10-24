import {
  addAssets,
  Assets,
  LucidEvolution,
  UTxO,
} from '@lucid-evolution/lucid';
import { array as A } from 'fp-ts';
import { negateAssets } from '../../src/helpers/value-helpers';

export async function getValueChangeAtAddressAfterAction<T>(
  lucid: LucidEvolution,
  address: string,
  action: () => Promise<T>,
): Promise<[T, Assets]> {
  const valBefore = A.reduce<UTxO, Assets>({}, (acc, utxo) =>
    addAssets(acc, utxo.assets),
  )(await lucid.utxosAt(address));

  const res = await action();

  const valAfter = A.reduce<UTxO, Assets>({}, (acc, utxo) =>
    addAssets(acc, utxo.assets),
  )(await lucid.utxosAt(address));

  return [res, addAssets(valAfter, negateAssets(valBefore))];
}

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
