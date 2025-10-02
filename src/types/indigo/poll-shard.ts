import { Data } from '@lucid-evolution/lucid';
import { AssetClassSchema, OutputReferenceSchema } from '../generic';

const PollShardParamsSchema = Data.Object({
  pollToken: AssetClassSchema,
  stakingToken: AssetClassSchema,
  indyAsset: AssetClassSchema,
  stakingValHash: Data.Bytes(),
});
export type PollShardParams = Data.Static<typeof PollShardParamsSchema>;
export const PollShardParams =
  PollShardParamsSchema as unknown as PollShardParams;

const VoteOptionSchema = Data.Enum([Data.Literal('Yes'), Data.Literal('No')]);

const PollShardRedeemerSchema = Data.Enum([
  Data.Object({ Vote: VoteOptionSchema }),
  Data.Object({
    MergeShards: Data.Object({
      currentTime: Data.Integer(),
      pollManagerRef: OutputReferenceSchema,
    }),
  }),
]);
export type PollShardRedeemer = Data.Static<typeof PollShardRedeemerSchema>;
export const PollShardRedeemer =
  PollShardRedeemerSchema as unknown as PollShardRedeemer;

export function castPollShardParams(params: PollShardParams): Data {
  return Data.castTo(params, PollShardParams);
}
