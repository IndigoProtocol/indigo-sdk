import { Data, Datum } from '@lucid-evolution/lucid';
import { match, P } from 'ts-pattern';
import { AddressSchema, OutputReferenceSchema } from '../generic';

export const SPIntegerSchema = Data.Object({
  value: Data.Integer(),
});

const StabilityPoolSnapshotSchema = Data.Object({
  productVal: SPIntegerSchema,
  depositVal: SPIntegerSchema,
  sumVal: SPIntegerSchema,
  epoch: Data.Integer(),
  scale: Data.Integer(),
});

export type StabilityPoolSnapshot = Data.Static<
  typeof StabilityPoolSnapshotSchema
>;
export const StabilityPoolSnapshot =
  StabilityPoolSnapshotSchema as unknown as StabilityPoolSnapshot;

export const EpochToScaleToSumSchema = Data.Map(
  Data.Object({ epoch: Data.Integer(), scale: Data.Integer() }),
  Data.Object({ sum: Data.Integer() }),
  { minItems: 0 },
);

export type EpochToScaleToSum = Data.Static<typeof EpochToScaleToSumSchema>;
export const EpochToScaleToSum =
  EpochToScaleToSumSchema as unknown as EpochToScaleToSum;

export const StabilityPoolContentSchema = Data.Object({
  asset: Data.Bytes(),
  snapshot: StabilityPoolSnapshotSchema,
  epochToScaleToSum: EpochToScaleToSumSchema,
});

export type StabilityPoolContent = Data.Static<
  typeof StabilityPoolContentSchema
>;
export const StabilityPoolContent =
  StabilityPoolContentSchema as unknown as StabilityPoolContent;

export const AccountActionSchema = Data.Enum([
  Data.Object({ Create: Data.Object({}) }),
  Data.Object({
    Adjust: Data.Object({
      amount: Data.Integer(),
      outputAddress: AddressSchema,
    }),
  }),
  Data.Object({ Close: Data.Object({ outputAddress: AddressSchema }) }),
]);

export type AccountAction = Data.Static<typeof AccountActionSchema>;
export const AccountAction = AccountActionSchema as unknown as AccountAction;

export const AccountContentSchema = Data.Object({
  owner: Data.Bytes(),
  asset: Data.Bytes(),
  snapshot: StabilityPoolSnapshotSchema,
  request: Data.Nullable(AccountActionSchema),
});

export type AccountContent = Data.Static<typeof AccountContentSchema>;
export const AccountContent = AccountContentSchema as unknown as AccountContent;

export const SnapshotEpochToScaleToSumContentSchema = Data.Object({
  asset: Data.Bytes(),
  snapshot: EpochToScaleToSumSchema,
});

export type SnapshotEpochToScaleToSumContent = Data.Static<
  typeof SnapshotEpochToScaleToSumContentSchema
>;
export const SnapshotEpochToScaleToSumContent =
  SnapshotEpochToScaleToSumContentSchema as unknown as SnapshotEpochToScaleToSumContent;

export const StabilityPoolDatumSchema = Data.Enum([
  Data.Object({
    StabilityPool: Data.Object({ content: StabilityPoolContentSchema }),
  }),
  Data.Object({ Account: Data.Object({ content: AccountContentSchema }) }),
  Data.Object({
    SnapshotEpochToScaleToSum: Data.Object({
      content: SnapshotEpochToScaleToSumContentSchema,
    }),
  }),
]);

export type StabilityPoolDatum = Data.Static<typeof StabilityPoolDatumSchema>;
export const StabilityPoolDatum =
  StabilityPoolDatumSchema as unknown as StabilityPoolDatum;

export const StabilityPoolRedeemerSchema = Data.Enum([
  Data.Object({ RequestAction: Data.Object({ action: AccountActionSchema }) }),
  Data.Object({
    ProcessRequest: Data.Object({ requestRef: OutputReferenceSchema }),
  }),
  Data.Object({ AnnulRequest: Data.Object({}) }),
  Data.Object({ LiquidateCDP: Data.Object({}) }),
  Data.Object({ RecordEpochToScaleToSum: Data.Object({}) }),
  Data.Object({ UpgradeVersion: Data.Object({}) }),
]);

export type StabilityPoolRedeemer = Data.Static<
  typeof StabilityPoolRedeemerSchema
>;
export const StabilityPoolRedeemer =
  StabilityPoolRedeemerSchema as unknown as StabilityPoolRedeemer;

export function parseStabilityPoolDatum(datum: Datum): StabilityPoolContent {
  return match(Data.from<StabilityPoolDatum>(datum, StabilityPoolDatum))
    .with({ StabilityPool: { content: P.select() } }, (res) => res)
    .otherwise(() => {
      throw new Error('Expected a Stability Pool datum.');
    });
}

export function parseAccountDatum(datum: Datum): AccountContent {
  return match(Data.from<StabilityPoolDatum>(datum, StabilityPoolDatum))
    .with({ Account: { content: P.select() } }, (res) => res)
    .otherwise(() => {
      throw new Error('Expected a StakingPosition datum.');
    });
}

export function parseSnapshotEpochToScaleToSumDatum(
  datum: Datum,
): SnapshotEpochToScaleToSumContent {
  return match(Data.from<StabilityPoolDatum>(datum, StabilityPoolDatum))
    .with({ SnapshotEpochToScaleToSum: { content: P.select() } }, (res) => res)
    .otherwise(() => {
      throw new Error('Expected a StakingPosition datum.');
    });
}

export function serialiseStabilityPoolDatum(d: StabilityPoolDatum): Datum {
  let cbor = Data.to<StabilityPoolDatum>(d, StabilityPoolDatum);
  if ('StabilityPool' in d) {
    if (cbor.includes('bf')) {
      if (d.StabilityPool.content.epochToScaleToSum.size > 0) {
        cbor = cbor.replace(
          'bf',
          'a' + d.StabilityPool.content.epochToScaleToSum.size,
        );
        cbor = cbor.replace('ffffff', 'ffff');
      }
    }
  }
  return cbor;
}

export function serialiseStabilityPoolRedeemer(
  params: StabilityPoolRedeemer,
): string {
  return Data.to<StabilityPoolRedeemer>(params, StabilityPoolRedeemer);
}

const spPrecision: bigint = 1000000000000000000n;

export function mkSPInteger(value: bigint): bigint {
  return value * spPrecision;
}

export function spMul(a: bigint, b: bigint): bigint {
  return (a * b) / spPrecision;
}

export function spDiv(a: bigint, b: bigint): bigint {
  return (a * 1000000000000000000n) / b;
}
