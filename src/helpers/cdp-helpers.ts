import { LucidEvolution, UTxO } from "@lucid-evolution/lucid";
import { SystemParams } from "../types";

export class CDPHelpers {
    static async cdps(params: SystemParams, lucid: LucidEvolution): Promise<UTxO[]> {
        throw new Error('Not implemented');
    }
}