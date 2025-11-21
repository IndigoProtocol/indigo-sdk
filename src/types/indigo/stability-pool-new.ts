import { Core as EvoCore } from '@evolution-sdk/evolution';
import { match, P } from 'ts-pattern';

export const SPIntegerSchema = EvoCore.TSchema.Struct({
  value: EvoCore.TSchema.Integer,
});

export type SPInteger = typeof SPIntegerSchema.Type;

export const EpochToScaleToSumSchema = EvoCore.TSchema.Map(
  EvoCore.TSchema.Struct({
    epoch: EvoCore.TSchema.Integer,
    scale: EvoCore.TSchema.Integer,
  }),
  SPIntegerSchema,
);

export type EpochToScaleToSum = typeof EpochToScaleToSumSchema.Type;

const StabilityPoolSnapshotSchema = EvoCore.TSchema.Struct({
  productVal: SPIntegerSchema,
  depositVal: SPIntegerSchema,
  sumVal: SPIntegerSchema,
  epoch: EvoCore.TSchema.Integer,
  scale: EvoCore.TSchema.Integer,
});

export type StabilityPoolSnapshot = typeof StabilityPoolSnapshotSchema.Type;

export const StabilityPoolContentSchema = EvoCore.TSchema.Struct({
  asset: EvoCore.TSchema.ByteArray,
  poolSnapshot: StabilityPoolSnapshotSchema,
  epochToScaleToSum: EpochToScaleToSumSchema,
});

export type StabilityPoolContent = typeof StabilityPoolContentSchema.Type;

export const AccountContentSchema = EvoCore.TSchema.Struct({
  owner: EvoCore.TSchema.ByteArray,
  asset: EvoCore.TSchema.ByteArray,
  accountSnapshot: StabilityPoolSnapshotSchema,
  request: EvoCore.TSchema.NullOr(EvoCore.Data.DataSchema),
});

export type AccountContent = typeof AccountContentSchema.Type;

export const SnapshotEpochToScaleToSumContentSchema = EvoCore.TSchema.Struct({
  asset: EvoCore.TSchema.ByteArray,
  snapshot: EpochToScaleToSumSchema,
});

export type SnapshotEpochToScaleToSumContent =
  typeof SnapshotEpochToScaleToSumContentSchema.Type;

export const StabilityPoolDatumSchema = EvoCore.TSchema.Union(
  StabilityPoolContentSchema,
  AccountContentSchema,
  SnapshotEpochToScaleToSumContentSchema,
);

export function serialiseStabilityPoolDatum(
  d: typeof StabilityPoolDatumSchema.Type,
): string {
  return EvoCore.Data.withSchema(StabilityPoolDatumSchema, {
    mode: 'custom',
    useIndefiniteArrays: true,
    // This is important to match aiken's Map encoding.
    useIndefiniteMaps: false,
    useDefiniteForEmpty: true,
    sortMapKeys: false,
    useMinimalEncoding: true,
    mapsAsObjects: false,
  }).toCBORHex(d);
}

export function parseStabilityPoolDatum(datum: string): StabilityPoolContent {
  return match(
    EvoCore.Data.withSchema(StabilityPoolDatumSchema).fromCBORHex(datum),
  )
    .with({ poolSnapshot: P.any }, (res) => res)
    .otherwise(() => {
      throw new Error('Expected a Stability Pool datum.');
    });
}

export function parseAccountDatum(datum: string): AccountContent {
  return match(
    EvoCore.Data.withSchema(StabilityPoolDatumSchema).fromCBORHex(datum),
  )
    .with({ accountSnapshot: P.any }, (res) => res)
    .otherwise(() => {
      throw new Error('Expected a Stability Pool datum.');
    });
}
export function parseSnapshotEpochToScaleToSumDatum(
  datum: string,
): SnapshotEpochToScaleToSumContent {
  return match(
    EvoCore.Data.withSchema(StabilityPoolDatumSchema).fromCBORHex(datum),
  )
    .with({ snapshot: P.any }, (res) => res)
    .otherwise(() => {
      throw new Error('Expected a Stability Pool datum.');
    });
}

/** SP Integer */
const spPrecision: bigint = 1000000000000000000n;

export function mkSPInteger(value: bigint): SPInteger {
  return { value: value * spPrecision };
}

export function fromSPInteger(value: SPInteger): bigint {
  return value.value / spPrecision;
}

export function spAdd(a: SPInteger, b: SPInteger): SPInteger {
  return { value: a.value + b.value };
}

export function spSub(a: SPInteger, b: SPInteger): SPInteger {
  return { value: a.value - b.value };
}

export function spMul(a: SPInteger, b: SPInteger): SPInteger {
  return { value: (a.value * b.value) / spPrecision };
}

export function spDiv(a: SPInteger, b: SPInteger): SPInteger {
  return { value: (a.value * spPrecision) / b.value };
}
