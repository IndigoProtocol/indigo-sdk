import { fromText, LucidEvolution, ScriptHash } from '@lucid-evolution/lucid';
import { createScriptAddress } from '../../src/helpers/lucid-utils';
import { AssetClass } from '../../src/types/generic';
import { assetClassToUnit } from '../../src/helpers/value-helpers';
import { IAssetOutput, matchSingle, parseIAssetDatum } from '../../src';
import { option as O, array as A, function as F } from 'fp-ts';

export async function findIAsset(
  lucid: LucidEvolution,
  iassetScriptHash: ScriptHash,
  iassetNft: AssetClass,
  // Ascii encoded
  iassetName: string,
): Promise<IAssetOutput> {
  const iassetUtxos = await lucid.utxosAtWithUnit(
    createScriptAddress(lucid.config().network!, iassetScriptHash),
    assetClassToUnit(iassetNft),
  );

  return matchSingle(
    F.pipe(
      iassetUtxos.map((utxo) =>
        F.pipe(
          O.fromNullable(utxo.datum),
          O.flatMap(parseIAssetDatum),
          O.flatMap((datum) => {
            if (datum.assetName === fromText(iassetName)) {
              return O.some({ utxo, datum: datum });
            } else {
              return O.none;
            }
          }),
        ),
      ),
      A.compact,
    ),
    (res) =>
      new Error('Expected a single IAsset UTXO.: ' + JSON.stringify(res)),
  );
}

export async function findAllIAssets(
  lucid: LucidEvolution,
  iassetScriptHash: ScriptHash,
  iassetNft: AssetClass,
): Promise<IAssetOutput[]> {
  const iassetUtxos = await lucid.utxosAtWithUnit(
    createScriptAddress(lucid.config().network!, iassetScriptHash),
    assetClassToUnit(iassetNft),
  );

  return F.pipe(
    iassetUtxos.map((utxo) =>
      F.pipe(
        O.fromNullable(utxo.datum),
        O.flatMap(parseIAssetDatum),
        O.map((datum) => ({ utxo, datum: datum })),
      ),
    ),
    A.compact,
  );
}
