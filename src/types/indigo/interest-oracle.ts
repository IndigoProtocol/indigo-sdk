import { Data, Datum } from '@lucid-evolution/lucid';
import { OnChainDecimalSchema } from '../on-chain-decimal';

export const InterestOracleDatumSchema = Data.Object({
  unitaryInterest: Data.Integer(),
  interestRate: OnChainDecimalSchema,
  lastUpdated: Data.Integer(),
});
export type InterestOracleDatum = Data.Static<typeof InterestOracleDatumSchema>;
const InterestOracleDatum =
  InterestOracleDatumSchema as unknown as InterestOracleDatum;

export function parseInterestOracleDatum(datum: Datum): InterestOracleDatum {
  return Data.from<InterestOracleDatum>(datum, InterestOracleDatum);
}

export function serialiseInterestOracleDatum(
  datum: InterestOracleDatum,
): Datum {
  return Data.to<InterestOracleDatum>(datum, InterestOracleDatum);
}

export const InterestOracleParamsSchema = Data.Object({
  /**  Milliseconds */
  biasTime: Data.Integer(),
  owner: Data.Bytes(),
});
export type InterestOracleParams = Data.Static<
  typeof InterestOracleParamsSchema
>;
const InterestOracleParams =
  InterestOracleParamsSchema as unknown as InterestOracleParams;

export function castInterestOracleParams(params: InterestOracleParams): Data {
  return Data.castTo(params, InterestOracleParams);
}
