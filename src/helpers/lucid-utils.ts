import { Credential, LucidEvolution, paymentCredentialOf, stakeCredentialOf, UTxO } from "@lucid-evolution/lucid";
import { ScriptReference } from "../types";

export async function addrDetails(lucid: LucidEvolution): Promise<[Credential, Credential | undefined]> {
  const addr = await lucid.wallet().address();
  return [
    paymentCredentialOf(addr),
    stakeCredentialOf(addr)
  ]
}

export async function scriptRef(ref: ScriptReference, lucid: LucidEvolution): Promise<UTxO> {
    const utxos = await lucid.utxosByOutRef([{txHash: ref.input.transactionId,outputIndex: ref.input.index }]);
    if (utxos.length === 0)
        throw 'Unable to locate script ref.';
    return utxos[0];
}

export const getRandomElement = (arr: any[]) =>
    arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined