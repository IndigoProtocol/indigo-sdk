import { Core as EvoCore } from '@evolution-sdk/evolution';
import { option as O, function as F } from 'fp-ts';
import { match, P } from 'ts-pattern';
import { DEFAULT_SCHEMA_OPTIONS } from '../../types/evolution-schema-options';

const StakingPosLockedAmtSchema = EvoCore.TSchema.Map(
  EvoCore.TSchema.Integer,
  EvoCore.TSchema.Struct({
    voteAmt: EvoCore.TSchema.Integer,
    votingEnd: EvoCore.TSchema.Integer,
  }),
);

export type StakingPosLockedAmt = typeof StakingPosLockedAmtSchema.Type;

const RewardSnapshotSchema = EvoCore.TSchema.Struct({
  snapshotAda: EvoCore.TSchema.Integer,
});

const StakingPositionSchema = EvoCore.TSchema.Struct({
  owner: EvoCore.TSchema.ByteArray,
  lockedAmount: StakingPosLockedAmtSchema,
  positionSnapshot: RewardSnapshotSchema,
});
export type StakingPosition = typeof StakingPositionSchema.Type;

const StakingManagerSchema = EvoCore.TSchema.Struct({
  totalStake: EvoCore.TSchema.Integer,
  managerSnapshot: RewardSnapshotSchema,
});
export type StakingManager = typeof StakingManagerSchema.Type;

const StakingDatumSchema = EvoCore.TSchema.Union(
  StakingManagerSchema,
  StakingPositionSchema,
);
type StakingDatum = typeof StakingDatumSchema.Type;

export function parseStakingPosition(datum: string): O.Option<StakingPosition> {
  try {
    return match(
      EvoCore.Data.withSchema(
        StakingDatumSchema,
        DEFAULT_SCHEMA_OPTIONS,
      ).fromCBORHex(datum),
    )
      .with({ owner: P.any }, (res) => O.some(res))
      .otherwise(() => O.none);
  } catch (_) {
    return O.none;
  }
}

export function parseStakingPositionOrThrow(datum: string): StakingPosition {
  return F.pipe(
    parseStakingPosition(datum),
    O.match(() => {
      throw new Error('Expected a StakingPosition datum.');
    }, F.identity),
  );
}

export function parseStakingManagerDatum(datum: string): StakingManager {
  return match(
    EvoCore.Data.withSchema(
      StakingDatumSchema,
      DEFAULT_SCHEMA_OPTIONS,
    ).fromCBORHex(datum),
  )
    .with({ totalStake: P.any }, (res) => res)
    .otherwise(() => {
      throw new Error('Expected a StakingPosition datum.');
    });
}

export function serialiseStakingDatum(d: StakingDatum): string {
  return EvoCore.Data.withSchema(
    StakingDatumSchema,
    DEFAULT_SCHEMA_OPTIONS,
  ).toCBORHex(d);
}
