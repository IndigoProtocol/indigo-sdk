import { Data, Datum } from '@lucid-evolution/lucid';
import { AssetClassSchema } from '../generic';
import { OnChainDecimalSchema } from '../on-chain-decimal';

export const OracleAssetNftSchema = Data.Object({
  oracleNft: AssetClassSchema,
});
export type OracleAssetNft = Data.Static<typeof OracleAssetNftSchema>;

export const PriceOracleParamsSchema = Data.Object({
  owner: Data.Bytes(),
  /**  Milliseconds */
  biasTime: Data.Integer(),
  /**  Milliseconds */
  expiration: Data.Integer(),
});
export type PriceOracleParams = Data.Static<typeof PriceOracleParamsSchema>;
const PriceOracleParams =
  PriceOracleParamsSchema as unknown as PriceOracleParams;

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

export function castPriceOracleParams(params: PriceOracleParams): Data {
  return Data.castTo(params, PriceOracleParams);
}
