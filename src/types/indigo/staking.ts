import { Data, Datum, Redeemer } from '@lucid-evolution/lucid';
import { AssetClassSchema } from '../generic';
import { match, P } from 'ts-pattern';

const StakingParamsSchema = Data.Object({
  stakingManagerNft: AssetClassSchema,
  stakingToken: AssetClassSchema,
  indyToken: AssetClassSchema,
  pollToken: AssetClassSchema,
  versionRecordToken: AssetClassSchema,
  collectorValHash: Data.Bytes(),
});
export type StakingParams = Data.Static<typeof StakingParamsSchema>;
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

const RewardSnapshotSchema = Data.Object({ snapshotAda: Data.Integer() });

const StakingManagerContentSchema = Data.Object({
  totalStake: Data.Integer(),
  managerSnapshot: RewardSnapshotSchema,
});
export type StakingManagerContent = Data.Static<
  typeof StakingManagerContentSchema
>;

const StakingPositionContentSchema = Data.Object({
  owner: Data.Bytes(),
  lockedAmount: Data.Map(
    Data.Integer(),
    Data.Tuple([Data.Integer(), Data.Integer()], {
      hasConstr: true,
    }),
  ),
  positionSnapshot: RewardSnapshotSchema,
});
export type StakingPositionContent = Data.Static<
  typeof StakingPositionContentSchema
>;

const StakingDatumSchema = Data.Enum([
  Data.Object({
    StakingManager: Data.Object({ content: StakingManagerContentSchema }),
  }),
  Data.Object({
    StakingPosition: Data.Object({ content: StakingPositionContentSchema }),
  }),
]);
export type StakingDatum = Data.Static<typeof StakingDatumSchema>;
const StakingDatum = StakingDatumSchema as unknown as StakingDatum;

export function parseStakingPositionDatum(
  datum: Datum,
): StakingPositionContent {
  return match(Data.from<StakingDatum>(datum, StakingDatum))
    .with({ StakingPosition: { content: P.select() } }, (res) => res)
    .otherwise(() => {
      throw new Error('Expected a StakingPosition datum.');
    });
}

export function parseStakingManagerDatum(datum: Datum): StakingManagerContent {
  return match(Data.from<StakingDatum>(datum, StakingDatum))
    .with({ StakingManager: { content: P.select() } }, (res) => res)
    .otherwise(() => {
      throw new Error('Expected a StakingPosition datum.');
    });
}

export function serialiseStakingRedeemer(redeemer: StakingRedeemer): Redeemer {
  return Data.to<StakingRedeemer>(redeemer, StakingRedeemer);
}

export function serialiseStakingDatum(d: StakingDatum): Datum {
  return Data.to<StakingDatum>(d, StakingDatum);
}

export function castStakingParams(params: StakingParams): Data {
  return Data.castTo(params, StakingParams);
}
