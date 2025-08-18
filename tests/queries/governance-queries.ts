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
  
  export async function findGov(
    lucid: LucidEvolution,
    govScriptHash: ScriptHash,
    govNft: AssetClass,
  ): Promise<UTxO> {
    const iassetUtxos = await lucid.utxosAtWithUnit(
      createScriptAddress(lucid.config().network, govScriptHash),
      assetClassToUnit(govNft),
    );
  
    return matchSingle(
      iassetUtxos.filter((utxo) => {
        if (utxo.datum != null) {
          try {
            return true; // TODO: implement Gov Datum
          } catch (_) {
            // when incompatible datum
            return false;
          }
        }
      }),
      (res) =>
        new Error('Expected a single Gov UTXO.: ' + JSON.stringify(res)),
    );
  }
  