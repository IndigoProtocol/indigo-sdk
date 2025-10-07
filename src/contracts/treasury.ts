import {
  addAssets,
  Constr,
  Data,
  LucidEvolution,
  OutRef,
  paymentCredentialOf,
  TxBuilder,
  validatorToScriptHash,
} from '@lucid-evolution/lucid';
import { serialiseTreasuryRedeemer, TreasuryParams } from '../types/indigo/treasury';
import { mkLovelacesOf } from '../helpers/value-helpers';
import { mkTreasuryAddress } from '../scripts/treasury-validator';

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

// TODO: Add a function to prepare a withdrawal from the treasury
// export async function prepareWithdrawal()

export async function treasuryMerge(
  treasuryInputs: OutRef[],
  lucid: LucidEvolution,
  treasuryScriptRef: OutRef,
  treasuryParams: TreasuryParams,
): Promise<TxBuilder> {
  const [treasuryScriptRefUtxo] = await lucid.utxosByOutRef([treasuryScriptRef]);
  const treasuryInputsUtxos = await lucid.utxosByOutRef(treasuryInputs);

  const totalAssets = treasuryInputsUtxos.reduce((acc, utxo) => {
    return addAssets(acc, utxo.assets);
  }, mkLovelacesOf(0n));

  const treasuryAddress = mkTreasuryAddress(treasuryParams, lucid.config().network!);

  return lucid.newTx()
    .collectFrom(treasuryInputsUtxos, serialiseTreasuryRedeemer('Merge'))
    .pay.ToContract(
      treasuryAddress,
      { kind: 'inline', value: Data.void() },
      totalAssets
    )
    .readFrom([treasuryScriptRefUtxo]);
}

export async function treasurySplit(
  treasuryInput: OutRef,
  lucid: LucidEvolution,
  treasuryScriptRef: OutRef,
  treasuryParams: TreasuryParams,
): Promise<TxBuilder> {
  const [treasuryScriptRefUtxo] = await lucid.utxosByOutRef([treasuryScriptRef]);
  const [treasuryInputsUtxo] = await lucid.utxosByOutRef([treasuryInput]);
  const assets = Object.keys(treasuryInputsUtxo.assets);
  
  const treasuryAddress = mkTreasuryAddress(treasuryParams, lucid.config().network!);

  const tx = lucid.newTx()
    .collectFrom([treasuryInputsUtxo], serialiseTreasuryRedeemer('Split'))
    .readFrom([treasuryScriptRefUtxo]);

  for (const asset of assets) {
    tx.pay.ToContract(
      treasuryAddress,
      { kind: 'inline', value: Data.void() },
      { [asset]: treasuryInputsUtxo.assets[asset] }
    );
  }

  return tx;
}