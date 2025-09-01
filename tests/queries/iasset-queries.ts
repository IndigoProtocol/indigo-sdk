import {
  fromText,
  LucidEvolution,
  ScriptHash,
  UTxO,
} from '@lucid-evolution/lucid';
import { createScriptAddress } from '../../src/helpers/lucid-utils';
import { AssetClass } from '../../src/types/generic';
import { assetClassToUnit } from '../../src/helpers/value-helpers';
import { matchSingle, parseIAssetDatum } from '../../src';

export async function findIAsset(
  lucid: LucidEvolution,
  iassetScriptHash: ScriptHash,
  iassetNft: AssetClass,
  iassetName: string,
): Promise<UTxO> {
  const iassetUtxos = await lucid.utxosAtWithUnit(
    createScriptAddress(lucid.config().network, iassetScriptHash),
    assetClassToUnit(iassetNft),
  );

  return matchSingle(
    iassetUtxos.filter((utxo) => {
      if (utxo.datum != null) {
        try {
          const iassetDatum = parseIAssetDatum(utxo.datum);

          return iassetDatum.assetName == fromText(iassetName);
        } catch (_) {
          // when incompatible datum
          return false;
        }
      }
    }),
    (res) =>
      new Error('Expected a single IAsset UTXO.: ' + JSON.stringify(res)),
  );
}
