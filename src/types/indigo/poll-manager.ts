import { Data } from '@lucid-evolution/lucid';
import { AssetClassSchema } from '../generic';

const PollManagerParamsSchema = Data.Object({
  govNFT: AssetClassSchema,
  pollToken: AssetClassSchema,
  upgradeToken: AssetClassSchema,
  indyAsset: AssetClassSchema,
  govExecuteValHash: Data.Bytes(),
  pBiasTime: Data.Integer(),
  shardValHash: Data.Bytes(),
  treasuryValHash: Data.Bytes(),
  initialIndyDistribution: Data.Integer(),
});
export type PollManagerParams = Data.Static<typeof PollManagerParamsSchema>;
export const PollManagerParams =
  PollManagerParamsSchema as unknown as PollManagerParams;

export function castPollManagerParams(params: PollManagerParams): Data {
  return Data.castTo(params, PollManagerParams);
}
