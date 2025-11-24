import { fromText, LucidEvolution, OutRef, UTxO } from '@lucid-evolution/lucid';
import { SystemParams } from '../types/system-params';
import { IAssetContent, parseIAssetDatumOrThrow } from '../types/indigo/cdp';
import { createScriptAddress } from './lucid-utils';

export type IAssetOutput = { utxo: UTxO; datum: IAssetContent };

export class IAssetHelpers {
  static async findIAssetByRef(
    outRef: OutRef,
    lucid: LucidEvolution,
  ): Promise<IAssetOutput> {
    return lucid
      .utxosByOutRef([outRef])
      .then((utxos) =>
        utxos
          .map((utxo) => {
            if (!utxo.datum) return undefined;
            const datum = parseIAssetDatumOrThrow(utxo.datum);
            return { utxo, datum };
          })
          .find((utxo) => utxo !== undefined),
      )
      .then((result) => {
        if (!result)
          throw new Error('Unable to locate IAsset by output reference.');
        return result;
      });
  }

  static async findIAssetByName(
    assetName: string,
    params: SystemParams,
    lucid: LucidEvolution,
  ): Promise<IAssetOutput> {
    return lucid
      .utxosAtWithUnit(
        createScriptAddress(
          lucid.config().network!,
          params.validatorHashes.cdpHash,
        ),
        params.cdpParams.iAssetAuthToken[0].unCurrencySymbol +
          fromText(params.cdpParams.iAssetAuthToken[1].unTokenName),
      )
      .then((utxos) =>
        utxos
          .map((utxo) => {
            if (!utxo.datum) return undefined;
            const datum = parseIAssetDatumOrThrow(utxo.datum);
            if (datum.assetName !== fromText(assetName)) return undefined;
            return { utxo, datum };
          })
          .find((utxo) => utxo !== undefined),
      )
      .then((result) => {
        if (!result) throw new Error('Unable to locate IAsset by name.');
        return result;
      });
  }
}
