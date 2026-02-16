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
import { matchSingle } from './utils';

/**
 * Union type accepting either a full UTxO or just an OutRef.
 * When a full UTxO is provided, no network fetch is needed.
 * When only an OutRef is provided, the UTxO will be fetched via utxosByOutRef.
 */
export type UtxoOrOutRef = UTxO | OutRef;

/**
 * Resolves a UTxOOrOutRef to a full UTxO.
 * If the input is already a UTxO (has 'address' property), returns it directly.
 * If the input is an OutRef, fetches the UTxO from the network.
 *
 * @param input - Either a full UTxO or an OutRef
 * @param lucid - The LucidEvolution instance for network queries
 * @param errorMsg - Custom error message if the UTxO cannot be found
 * @returns The resolved UTxO
 */
export async function resolveUtxo(
  input: UtxoOrOutRef,
  lucid: LucidEvolution,
  errorMsg: string = 'Expected a single UTXO',
): Promise<UTxO> {
  // UTxO has 'address' property, OutRef only has 'txHash' and 'outputIndex'
  if ('address' in input) {
    return input;
  }
  return matchSingle(
    await lucid.utxosByOutRef([input]),
    (_) => new Error(errorMsg),
  );
}

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
  let stakeCredential = undefined;
  try {
    stakeCredential = stakeCredentialOf(addr);
  } catch (_) {
    // No stake credential
  }
  return [paymentCredentialOf(addr), stakeCredential];
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
