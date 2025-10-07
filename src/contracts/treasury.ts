import {
  Constr,
  Data,
  LucidEvolution,
  OutRef,
  TxBuilder,
} from '@lucid-evolution/lucid';

export async function treasuryFeeTx(
  fee: bigint,
  lucid: LucidEvolution,
  treasuryRef: OutRef,
  treasuryScriptRef: OutRef,
): Promise<TxBuilder> {
  const [
    treasuryUtxo,
    treasuryScriptRefUtxo,
  ] = await lucid.utxosByOutRef([
    treasuryRef,
    treasuryScriptRef,
  ]);

  return lucid.newTx().collectFrom([treasuryUtxo], Data.to(new Constr(4, [])))
    .pay.ToContract(
      treasuryUtxo.address,
      { kind: 'inline', value: treasuryUtxo.datum || '' },
      {
        ...treasuryUtxo.assets,
        lovelace: treasuryUtxo.assets['lovelace'] + fee,
      },
    )
    .readFrom([treasuryScriptRefUtxo]);
}
