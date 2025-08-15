import { Data } from '@lucid-evolution/lucid';

export const SPIntegerSchema = Data.Object({
  value: Data.Integer(),
});

export const StabilityPoolSnapshotSchema = Data.Object({
  productVal: SPIntegerSchema,
  depositVal: SPIntegerSchema,
  sumVal: SPIntegerSchema,
  epoch: Data.Integer(),
  scale: Data.Integer(),
});

export const EpochToScaleToSumSchema = Data.Map(
  Data.Object({ epoch: Data.Integer(), scale: Data.Integer() }),
  Data.Object({ sum: Data.Integer() }),
  { minItems: 0 },
);

export const StabilityPoolContentSchema = Data.Object({
  content: Data.Object({
    asset: Data.Bytes(),
    snapshot: StabilityPoolSnapshotSchema,
    epochToScaleToSum: EpochToScaleToSumSchema,
  }),
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
      outputAddress: Data.Bytes(),
    }),
  }),
  Data.Object({ Close: Data.Object({ outputAddress: Data.Bytes() }) }),
]);

export const AccountContentSchema = Data.Object({
  content: Data.Object({
    owner: Data.Bytes(),
    asset: Data.Bytes(),
    snapshot: StabilityPoolSnapshotSchema,
    request: Data.Nullable(Data.Any()),
  }),
});

export type AccountContent = Data.Static<typeof AccountContentSchema>;
export const AccountContent = AccountContentSchema as unknown as AccountContent;

export const SnapshotEpochToScaleToSumContentSchema = Data.Object({
  content: Data.Object({
    asset: Data.Bytes(),
    snapshot: EpochToScaleToSumSchema,
  }),
});

export type SnapshotEpochToScaleToSumContent = Data.Static<
  typeof SnapshotEpochToScaleToSumContentSchema
>;
export const SnapshotEpochToScaleToSumContent =
  SnapshotEpochToScaleToSumContentSchema as unknown as SnapshotEpochToScaleToSumContent;

export const StabilityPoolDatumSchema = Data.Enum([
  Data.Object({ StabilityPool: StabilityPoolContentSchema }),
  Data.Object({ Account: AccountContentSchema }),
  Data.Object({
    SnapshotEpochToScaleToSum: SnapshotEpochToScaleToSumContentSchema,
  }),
]);

export type StabilityPoolDatum = Data.Static<typeof StabilityPoolDatumSchema>;
export const StabilityPoolDatum =
  StabilityPoolDatumSchema as unknown as StabilityPoolDatum;

// export type StabilityPoolSnapshot = {
//     productVal: bigint;
//     depositVal: bigint;
//     sumVal: bigint;
//     epoch: bigint;
//     scale: bigint;
// };

// export type EpochToScaleKey = [bigint, bigint];
// export type EpochToScaleToSum = Map<EpochToScaleKey, bigint>;

// export type StabilityPoolDatum =
//     StabilityPoolContent |
//     AccountContent |
//     SnapshotEpochToScaleToSumContent;

// export type StabilityPoolContent = {
//     type: 'StabilityPoolContent';
//     asset: string;
//     snapshot: StabilityPoolSnapshot;
//     epochToScaleToSum: EpochToScaleToSum;
// }

// export type AccountAction = {
//     type: 'Create';
// } | {
//     type: 'Adjust';
//     amount: bigint;
//     outputAddress: string;
// } | {
//     type: 'Close';
//     outputAddress: string;
// }

// export type AccountContent = {
//     type: 'AccountContent';
//     owner: string;
//     asset: string;
//     snapshot: StabilityPoolSnapshot;
//     request?: AccountAction;
// }

// export type SnapshotEpochToScaleToSumContent = {
//     type: 'SnapshotEpochToScaleToSumContent';
//     snapshot: EpochToScaleToSum;
//     asset: string;
// }
