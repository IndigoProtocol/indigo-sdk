import { Data } from '@lucid-evolution/lucid';
import { OnChainDecimalSchema } from '../generic';

// Price oracle datum
export const PriceOracleSchema = Data.Object({
  price: OnChainDecimalSchema,
  expiration: Data.Integer(),
});

export type PriceOracle = Data.Static<typeof PriceOracleSchema>;
export const PriceOracle = PriceOracleSchema as unknown as PriceOracle;