import { Data } from '@lucid-evolution/lucid';
import { AssetClassSchema } from '../generic';

const PollShardParamsSchema = Data.Object({
  pollToken: AssetClassSchema,
  stakingToken: AssetClassSchema,
  indyAsset: AssetClassSchema,
  stakingValHash: Data.Bytes(),
});
export type PollShardParams = Data.Static<typeof PollShardParamsSchema>;
export const PollShardParams =
  PollShardParamsSchema as unknown as PollShardParams;

export function castPollShardParams(params: PollShardParams): Data {
  return Data.castTo(params, PollShardParams);
}
