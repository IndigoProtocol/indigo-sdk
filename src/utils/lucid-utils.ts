import {
  addAssets,
  Address,
  Assets,
  Credential,
  credentialToAddress,
  Datum,
  LucidEvolution,
  Network,
  OutRef,
  paymentCredentialOf,
  ScriptHash,
  scriptHashToCredential,
  stakeCredentialOf,
  UTxO,
} from '@lucid-evolution/lucid';
import { ScriptReference } from '../types/system-params';

/**
 * Returns the inline datum.
 * Throws when the UTXO doesn't have an inline datum
 * (i.e. in case it has hash datum or no datum).
 */
export function getInlineDatumOrThrow(utxo: UTxO): Datum {
  if (utxo.datum != null) {
    return utxo.datum;
  }

  throw new Error(
    'Expected an inline datum for OutRef: ' +
      JSON.stringify({
        txHash: utxo.txHash,
        outputIndex: utxo.outputIndex,
      } as OutRef),
  );
}

export async function addrDetails(
  lucid: LucidEvolution,
): Promise<[Credential, Credential | undefined]> {
  const addr = await lucid.wallet().address();
  return [paymentCredentialOf(addr), stakeCredentialOf(addr)];
}

export function createScriptAddress(
  network: Network,
  scriptHash: ScriptHash,
  stakeCredential?: Credential,
): Address {
  return credentialToAddress(
    network,
    scriptHashToCredential(scriptHash),
    stakeCredential,
  );
}

export async function scriptRef(
  ref: ScriptReference,
  lucid: LucidEvolution,
): Promise<UTxO> {
  const utxos = await lucid.utxosByOutRef([
    { txHash: ref.input.transactionId, outputIndex: ref.input.index },
  ]);
  if (utxos.length === 0) throw Error('Unable to locate script ref.');
  return utxos[0];
}

export function balance(utxos: UTxO[]): Assets {
  return utxos.reduce((acc, utxo) => addAssets(acc, utxo.assets), {});
}
