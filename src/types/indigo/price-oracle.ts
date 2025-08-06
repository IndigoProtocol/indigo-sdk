import { Data, Datum } from '@lucid-evolution/lucid';
import { AssetClassSchema } from '../generic';
import { OnChainDecimalSchema } from '../on-chain-decimal';

export const OracleAssetNftSchema = Data.Object({
  oracleNft: AssetClassSchema,
});

export const PriceOracleParamsSchema = Data.Object({
  owner: Data.Bytes(),
  biasTime: Data.Integer(),
  expiration: Data.Integer(),
});
export type PriceOracleParams = Data.Static<typeof PriceOracleParamsSchema>;

export const PriceOracleDatumSchema = Data.Object({
  price: OnChainDecimalSchema,
  expiration: Data.Integer(),
});
export type PriceOracleDatum = Data.Static<typeof PriceOracleDatumSchema>;
const PriceOracleDatum = PriceOracleDatumSchema as unknown as PriceOracleDatum;

export function parsePriceOracleDatum(datum: Datum): PriceOracleDatum {
  return Data.from<PriceOracleDatum>(datum, PriceOracleDatum);
}

export function serialisePriceOracleDatum(datum: PriceOracleDatum): Datum {
  return Data.to<PriceOracleDatum>(datum, PriceOracleDatum);
}
