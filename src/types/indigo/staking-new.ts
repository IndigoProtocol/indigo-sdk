import { Data, TSchema } from '@evolution-sdk/evolution';
import { option as O, function as F } from 'fp-ts';
import { match, P } from 'ts-pattern';

const StakingPosLockedAmtSchema = TSchema.Map(
  TSchema.Integer,
  TSchema.Struct({ voteAmt: TSchema.Integer, votingEnd: TSchema.Integer }),
);

export type StakingPosLockedAmt = typeof StakingPosLockedAmtSchema.Type;

const RewardSnapshotSchema = TSchema.Struct({
  snapshotAda: TSchema.Integer,
});

const StakingPositionSchema = TSchema.Struct({
  owner: TSchema.ByteArray,
  lockedAmount: StakingPosLockedAmtSchema,
  positionSnapshot: RewardSnapshotSchema,
});
export type StakingPosition = typeof StakingPositionSchema.Type;

const StakingManagerSchema = TSchema.Struct({
  totalStake: TSchema.Integer,
  managerSnapshot: RewardSnapshotSchema,
});
export type StakingManager = typeof StakingManagerSchema.Type;

const StakingDatumSchema = TSchema.Union(
  StakingManagerSchema,
  StakingPositionSchema,
);
type StakingDatum = typeof StakingDatumSchema.Type;

export function parseStakingPosition(datum: string): O.Option<StakingPosition> {
  try {
    return match(Data.withSchema(StakingDatumSchema).fromCBORHex(datum))
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
  return match(Data.withSchema(StakingDatumSchema).fromCBORHex(datum))
    .with({ totalStake: P.any }, (res) => res)
    .otherwise(() => {
      throw new Error('Expected a StakingPosition datum.');
    });
}

export function serialiseStakingDatum(d: StakingDatum): string {
  return Data.withSchema(StakingDatumSchema).toCBORHex(d, {
    mode: 'custom',
    useIndefiniteArrays: true,
    // This is important to match aiken's Map encoding.
    useIndefiniteMaps: false,
    useDefiniteForEmpty: true,
    sortMapKeys: false,
    useMinimalEncoding: true,
    mapsAsObjects: false,
  });
}
