import {
  Credential,
  LucidEvolution,
  ScriptHash,
  UTxO,
} from '@lucid-evolution/lucid';
import { createScriptAddress } from '../../src/utils/lucid-utils';
import {
  LRPDatum,
  parseLrpDatum,
  parseLrpDatumOrThrow,
} from '../../src/contracts/lrp/types';
import { SystemParams } from '../../src';
import { option as O, array as A, function as F } from 'fp-ts';

/**
 * Beware, this shouldn't be used in production since it queries all the UTXOs
 * at an address and does the filtering in this function.
 */
export async function findLrp(
  lucid: LucidEvolution,
  lrpScriptHash: ScriptHash,
  owner: string,
  assetTokenName: string,
  stakeCredential?: Credential,
): Promise<UTxO[]> {
  const network = lucid.config().network!;

  const lrpUtxos = await lucid.utxosAt(
    createScriptAddress(network, lrpScriptHash, stakeCredential),
  );

  return lrpUtxos.filter((utxo) => {
    if (utxo.datum != null) {
      try {
        const lrpDatum = parseLrpDatumOrThrow(utxo.datum);

        return lrpDatum.owner == owner && lrpDatum.iasset == assetTokenName;
      } catch (_) {
        // when incompatible datum
        return false;
      }
    }
  });
}

export async function findAllLrps(
  lucid: LucidEvolution,
  sysParams: SystemParams,
  // hex encoded
  iasset: string,
): Promise<{ utxo: UTxO; datum: LRPDatum }[]> {
  const lrpUtxos = await lucid.utxosAt(
    createScriptAddress(
      lucid.config().network!,
      sysParams.validatorHashes.lrpHash,
    ),
  );

  return F.pipe(
    lrpUtxos.map((utxo) =>
      F.pipe(
        O.fromNullable(utxo.datum),
        O.flatMap(parseLrpDatum),
        O.flatMap((datum) => {
          if (datum.iasset === iasset) {
            return O.some({ utxo, datum: datum });
          } else {
            return O.none;
          }
        }),
      ),
    ),
    A.compact,
  );
}
