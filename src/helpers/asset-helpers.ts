import { Data, fromText, LucidEvolution, OutRef, UTxO } from "@lucid-evolution/lucid";
import { CDPContract } from "../contracts/cdp";
import { SystemParams } from "../types/system-params";
import { CDPSchema, IAsset } from "../types/indigo/cdp";

export type IAssetOutput = { utxo: UTxO, datum: IAsset };

export class IAssetHelpers {
    static async findIAssetByRef(outRef: OutRef, params: SystemParams, lucid: LucidEvolution): Promise<IAssetOutput> {
        throw new Error('Not implemented');
    }

    static async findIAssetByName(assetName: string, params: SystemParams, lucid: LucidEvolution): Promise<IAssetOutput> {
        return lucid.utxosAtWithUnit(
            CDPContract.address(params.cdpParams, lucid),
            params.cdpParams.iAssetAuthToken[0].unCurrencySymbol + fromText(params.cdpParams.iAssetAuthToken[1].unTokenName),
        ).then(utxos => utxos.map(utxo => {
            if (!utxo.datum) return undefined;
            const datum = Data.from(utxo.datum, CDPSchema);
            if (!('IAsset' in datum)) return undefined;
            if (datum.IAsset.name !== assetName) return undefined;
            return { utxo, datum: datum.IAsset };
        }).find(utxo => utxo !== undefined)).then(result => {
            if (!result) throw 'Unable to locate IAsset by name.';
            return result;
        });
    } 
}