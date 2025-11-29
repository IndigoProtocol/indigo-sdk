import { Data, Redeemer } from '@lucid-evolution/lucid';
import { AssetClassSchema } from '../../types/generic';

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

const PollManagerRedeemerSchema = Data.Enum([
  Data.Object({
    EndPoll: Data.Object({ currentTime: Data.Integer() }),
  }),
  Data.Object({ CreateShards: Data.Object({ currentTime: Data.Integer() }) }),
  Data.Object({
    MergeShardsManager: Data.Object({ currentTime: Data.Integer() }),
  }),
]);
export type PollManagerRedeemer = Data.Static<typeof PollManagerRedeemerSchema>;
export const PollManagerRedeemer =
  PollManagerRedeemerSchema as unknown as PollManagerRedeemer;

export function serialisePollManagerRedeemer(r: PollManagerRedeemer): Redeemer {
  return Data.to<PollManagerRedeemer>(r, PollManagerRedeemer);
}

export function castPollManagerParams(params: PollManagerParams): Data {
  return Data.castTo(params, PollManagerParams);
}
