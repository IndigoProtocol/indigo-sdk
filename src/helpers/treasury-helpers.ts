import { Data, LucidEvolution, UTxO } from "@lucid-evolution/lucid";
import { TreasuryParams } from "../types/indigo/treasury";
import { mkTreasuryAddress } from "../scripts/treasury-validator";

export async function findTreasuryOutputs(
    lucid: LucidEvolution,
    treasuryParams: TreasuryParams,
): Promise<UTxO[]> {
    return (await lucid.utxosAt(mkTreasuryAddress(treasuryParams, lucid.config().network!)))
        .filter((utxo) => utxo.datum === Data.void());
}