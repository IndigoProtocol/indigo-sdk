import { Core as EvoCore } from '@evolution-sdk/evolution';
import { match, P } from 'ts-pattern';
import { EvoCommon } from '@3rd-eye-labs/cardano-offchain-common';

export const SPIntegerSchema = EvoCore.TSchema.Struct({
  value: EvoCore.TSchema.Integer,
});

export type SPInteger = typeof SPIntegerSchema.Type;

const AccountActionSchema = EvoCore.TSchema.Union(
  EvoCore.TSchema.Literal('Create', { flatInUnion: true }),
  EvoCore.TSchema.Struct(
    {
      Adjust: EvoCore.TSchema.Struct(
        {
          amount: EvoCore.TSchema.Integer,
          outputAddress: EvoCommon.AddressSchema,
        },
        { flatFields: true },
      ),
    },
    { flatInUnion: true },
  ),
  EvoCore.TSchema.Struct(
    {
      Close: EvoCore.TSchema.Struct(
        { outputAddress: EvoCommon.AddressSchema },
        { flatFields: true },
      ),
    },
    { flatInUnion: true },
  ),
);

export type AccountAction = typeof AccountActionSchema.Type;

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
  request: EvoCore.TSchema.NullOr(AccountActionSchema),
});

export type AccountContent = typeof AccountContentSchema.Type;

export const SnapshotEpochToScaleToSumContentSchema = EvoCore.TSchema.Struct({
  snapshot: EpochToScaleToSumSchema,
  asset: EvoCore.TSchema.ByteArray,
});

export type SnapshotEpochToScaleToSumContent =
  typeof SnapshotEpochToScaleToSumContentSchema.Type;

export const StabilityPoolDatumSchema = EvoCore.TSchema.Union(
  EvoCore.TSchema.Struct(
    { StabilityPool: StabilityPoolContentSchema },
    { flatInUnion: true },
  ),
  EvoCore.TSchema.Struct(
    { Account: AccountContentSchema },
    { flatInUnion: true },
  ),
  EvoCore.TSchema.Struct(
    { SnapshotEpochToScaleToSum: SnapshotEpochToScaleToSumContentSchema },
    { flatInUnion: true },
  ),
);

export const StabilityPoolRedeemerSchema = EvoCore.TSchema.Union(
  EvoCore.TSchema.Struct(
    { RequestAction: AccountActionSchema },
    { flatInUnion: true },
  ),
  EvoCore.TSchema.Struct(
    {
      ProcessRequest: EvoCore.TSchema.Struct({
        txHash: EvoCore.TSchema.Struct({ hash: EvoCore.TSchema.ByteArray }),
        outputIndex: EvoCore.TSchema.Integer,
      }),
    },
    { flatInUnion: true },
  ),
  EvoCore.TSchema.Literal('AnnulRequest', { flatInUnion: true }),
  EvoCore.TSchema.Literal('LiquidateCDP'),
  EvoCore.TSchema.Literal('RecordEpochToScaleToSum', { flatInUnion: true }),
  EvoCore.TSchema.Literal('UpgradeVersion', { flatInUnion: true }),
);

export type StabilityPoolRedeemer = typeof StabilityPoolRedeemerSchema.Type;

export function serialiseStabilityPoolRedeemer(
  r: StabilityPoolRedeemer,
): string {
  return EvoCore.Data.withSchema(StabilityPoolRedeemerSchema).toCBORHex(r);
}

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
    .with({ StabilityPool: P.select() }, (res) => res)
    .otherwise(() => {
      throw new Error('Expected a Stability Pool datum.');
    });
}

export function parseAccountDatum(datum: string): AccountContent {
  return match(
    EvoCore.Data.withSchema(StabilityPoolDatumSchema).fromCBORHex(datum),
  )
    .with({ Account: P.select() }, (res) => res)
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
    .with({ SnapshotEpochToScaleToSum: P.select() }, (res) => res)
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
