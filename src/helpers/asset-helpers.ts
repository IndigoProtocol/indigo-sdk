import { LucidEvolution, OutRef, UTxO } from "@lucid-evolution/lucid";
import { IAsset, SystemParams } from "../types";

export type IAssetOutput = { utxo: UTxO, datum: IAsset };

export class IAssetHelpers {
    static async findIAssetByRef(outRef: OutRef, params: SystemParams, lucid: LucidEvolution): Promise<IAssetOutput> {
        throw new Error('Not implemented');
    }

    static async findIAssetByName(assetName: string, params: SystemParams, lucid: LucidEvolution): Promise<IAssetOutput> {
        throw new Error('Not implemented');
    } 
}