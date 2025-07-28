import { Data } from '@lucid-evolution/lucid';
import { OnChainDecimalSchema } from '../generic';

// Interest oracle datum
export const InterestOracleSchema = Data.Object({
  unitaryInterest: Data.Integer(),
  interestRate: OnChainDecimalSchema,
  lastUpdated: Data.Integer(),
});

export type InterestOracle = Data.Static<typeof InterestOracleSchema>;
export const InterestOracle = InterestOracleSchema as unknown as InterestOracle;
