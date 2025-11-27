import { Data, Datum, Redeemer } from '@lucid-evolution/lucid';
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

const PriceOracleRedeemerSchema = Data.Object({
  currentTime: Data.Integer(),
  newPrice: OnChainDecimalSchema,
});
export type PriceOracleRedeemer = Data.Static<typeof PriceOracleRedeemerSchema>;
const PriceOracleRedeemer =
  PriceOracleRedeemerSchema as unknown as PriceOracleRedeemer;

export function serialisePriceOracleRedeemer(r: PriceOracleRedeemer): Redeemer {
  return Data.to<PriceOracleRedeemer>(r, PriceOracleRedeemer);
}

export function parsePriceOracleDatum(datum: Datum): PriceOracleDatum {
  return Data.from<PriceOracleDatum>(datum, PriceOracleDatum);
}

export function serialisePriceOracleDatum(datum: PriceOracleDatum): Datum {
  return Data.to<PriceOracleDatum>(datum, PriceOracleDatum);
}

export function castPriceOracleParams(params: PriceOracleParams): Data {
  return Data.castTo(params, PriceOracleParams);
}
