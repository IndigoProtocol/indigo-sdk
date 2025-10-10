import { Data, Redeemer } from '@lucid-evolution/lucid';
import { AssetClassSchema } from '../generic';

const StakingParamsSchema = Data.Object({
  stakingManagerNft: AssetClassSchema,
  stakingToken: AssetClassSchema,
  indyToken: AssetClassSchema,
  pollToken: AssetClassSchema,
  versionRecordToken: AssetClassSchema,
  collectorValHash: Data.Bytes(),
});
type StakingParams = Data.Static<typeof StakingParamsSchema>;
const StakingParams = StakingParamsSchema as unknown as StakingParams;

const StakingRedeemerSchema = Data.Enum([
  Data.Object({
    CreateStakingPosition: Data.Object({
      creatorPkh: Data.Bytes(),
    }),
  }),
  Data.Literal('UpdateTotalStake'),
  Data.Literal('Distribute'),
  Data.Object({
    AdjustStakedAmount: Data.Object({
      adjustAmount: Data.Integer(),
    }),
  }),
  Data.Literal('Unstake'),
  Data.Literal('Lock'),
  Data.Literal('UpgradeVersion'),
]);
export type StakingRedeemer = Data.Static<typeof StakingRedeemerSchema>;
const StakingRedeemer = StakingRedeemerSchema as unknown as StakingRedeemer;

export function serialiseStakingRedeemer(redeemer: StakingRedeemer): Redeemer {
  return Data.to<StakingRedeemer>(redeemer, StakingRedeemer);
}

export function castStakingParams(params: StakingParams): Data {
  return Data.castTo(params, StakingParams);
}
