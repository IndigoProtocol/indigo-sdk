import { fromText, LucidEvolution, OutRef, UTxO } from '@lucid-evolution/lucid';
import { CDPContract } from '../contracts/cdp';
import { SystemParams } from '../types/system-params';
import { IAsset } from '../types/indigo/cdp';

export type IAssetOutput = { utxo: UTxO; datum: IAsset };

export class IAssetHelpers {
  static async findIAssetByRef(
    outRef: OutRef,
    params: SystemParams,
    lucid: LucidEvolution,
  ): Promise<IAssetOutput> {
    throw new Error('Not implemented');
  }

  static async findIAssetByName(
    assetName: string,
    params: SystemParams,
    lucid: LucidEvolution,
  ): Promise<IAssetOutput> {
    return lucid
      .utxosAtWithUnit(
        CDPContract.address(params.cdpParams, lucid),
        params.cdpParams.iAssetAuthToken[0].unCurrencySymbol +
          fromText(params.cdpParams.iAssetAuthToken[1].unTokenName),
      )
      .then((utxos) =>
        utxos
          .map((utxo) => {
            if (!utxo.datum) return undefined;
            const datum = CDPContract.decodeCdpDatum(utxo.datum);
            if (datum.type !== 'IAsset') return undefined;
            if (datum.name !== assetName) return undefined;
            return { utxo, datum };
          })
          .find((utxo) => utxo !== undefined),
      )
      .then((result) => {
        if (!result) throw 'Unable to locate IAsset by name.';
        return result;
      });
  }
}
