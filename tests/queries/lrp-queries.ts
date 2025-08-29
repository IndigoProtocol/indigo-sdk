import {
  Credential,
  LucidEvolution,
  Network,
  ScriptHash,
  UTxO,
} from '@lucid-evolution/lucid';
import { createScriptAddress } from '../../src/helpers/lucid-utils';
import { parseLrpDatum } from '../../src/types/indigo/lrp';

/**
 * Beware, this shouldn't be used in production since it queries all the UTXOs
 * at an address and does the filtering in this function.
 */
export async function findLrp(
  lucid: LucidEvolution,
  network: Network,
  lrpScriptHash: ScriptHash,
  owner: string,
  assetTokenName: string,
  stakeCredential?: Credential,
): Promise<UTxO[]> {
  const lrpUtxos = await lucid.utxosAt(
    createScriptAddress(network, lrpScriptHash, stakeCredential),
  );

  return lrpUtxos.filter((utxo) => {
    if (utxo.datum != null) {
      try {
        const lrpDatum = parseLrpDatum(utxo.datum);

        return lrpDatum.owner == owner && lrpDatum.iasset == assetTokenName;
      } catch (_) {
        // when incompatible datum
        return false;
      }
    }
  });
}
