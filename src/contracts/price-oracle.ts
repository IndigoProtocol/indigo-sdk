import { Constr, Data } from "@lucid-evolution/lucid";
import { PriceOracleDatum } from "../types/indigo/price-oracle";

export class PriceOracleContract {
    static decodePriceOracleDatum(datum: string): PriceOracleDatum {
        const oracleDatum = Data.from(datum) as any;
        if (oracleDatum.index != 0 || oracleDatum.fields.length !== 2 || oracleDatum.fields[0].index !== 0)
            throw 'Invalid Price Oracle Datum provided.'
        
        return {
            price: oracleDatum.fields[0].fields[0],
            expiration: oracleDatum.fields[1],
        }
    }
    
    static encodePriceOracleDatum(datum: PriceOracleDatum): string {
        return Data.to(
            new Constr(0, [
                new Constr(0, [datum.price]),
                datum.expiration,
            ])
        )
    }
}