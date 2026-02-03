import {
  Credential,
  credentialToAddress,
  Data,
  Datum,
  getAddressDetails,
  LucidEvolution,
} from '@lucid-evolution/lucid';
import {
  AddressD,
  AddressSchema,
  AssetClassSchema,
  CredentialD,
  OutputReferenceSchema,
} from '../../types/generic';
import { match, P } from 'ts-pattern';

export const ActionReturnDatumSchema = Data.Enum([
  Data.Object({
    IndigoStabilityPoolAccountAdjustment: Data.Object({
      spent_account: OutputReferenceSchema,
    }),
  }),
  Data.Object({
    IndigoStabilityPoolAccountClosure: Data.Object({
      closed_account: OutputReferenceSchema,
    }),
  }),
]);

export type ActionReturnDatum = Data.Static<typeof ActionReturnDatumSchema>;
export const ActionReturnDatum =
  ActionReturnDatumSchema as unknown as ActionReturnDatum;

/** SP Parameters */
const StabilityPoolParamsSchema = Data.Object({
  assetSymbol: Data.Bytes(),
  stabilityPoolToken: AssetClassSchema,
  snapshotEpochToScaleToSumToken: AssetClassSchema,
  accountToken: AssetClassSchema,
  cdpToken: AssetClassSchema,
  iAssetAuthToken: AssetClassSchema,
  versionRecordToken: AssetClassSchema,
  collectorValHash: Data.Bytes(),
  govNFT: AssetClassSchema,
  accountCreateFeeLovelaces: Data.Integer(),
  accountAdjustmentFeeLovelaces: Data.Integer(),
  requestCollateralLovelaces: Data.Integer(),
});
export type StabilityPoolParams = Data.Static<typeof StabilityPoolParamsSchema>;
export const StabilityPoolParams =
  StabilityPoolParamsSchema as unknown as StabilityPoolParams;

export function castStabilityPoolParams(params: StabilityPoolParams): Data {
  return Data.castTo(params, StabilityPoolParams);
}

// export const VerificationKeyHashSchema = Data.Bytes({
//   minLength: 28,
//   maxLength: 28,
// });

// export const CredentialSchema = Data.Enum([
//   Data.Object({
//     PublicKeyCredential: Data.Tuple([VerificationKeyHashSchema]),
//   }),
//   Data.Object({
//     ScriptCredential: Data.Tuple([
//       Data.Bytes({ minLength: 28, maxLength: 28 }),
//     ]),
//   }),
// ]);
// export type CredentialD = Data.Static<typeof CredentialSchema>;
// export const CredentialD = CredentialSchema as unknown as CredentialD;

// export const StakeCredentialSchema = Data.Enum([
//   Data.Object({ Inline: Data.Tuple([CredentialSchema]) }),
//   Data.Object({
//     Pointer: Data.Tuple([
//       Data.Object({
//         slotNumber: Data.Integer(),
//         transactionIndex: Data.Integer(),
//         certificateIndex: Data.Integer(),
//       }),
//     ]),
//   }),
// ]);

// export const AddressSchema = Data.Object({
//   paymentCredential: CredentialSchema,
//   stakeCredential: Data.Nullable(StakeCredentialSchema),
// });
// export type AddressD = Data.Static<typeof AddressSchema>;
// export const AddressD = AddressSchema as unknown as AddressD;

export const AccountActionSchema = Data.Enum([
  Data.Literal('Create'),
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

export function serialiseStabilityPoolRedeemer(
  params: StabilityPoolRedeemer,
): string {
  return Data.to<StabilityPoolRedeemer>(params, StabilityPoolRedeemer, {
    canonical: false,
  });
}

export function spAddressToBech32(
  lucid: LucidEvolution,
  address: AddressD,
): string {
  const paymentCredential: Credential =
    'PublicKeyCredential' in address.paymentCredential
      ? { type: 'Key', hash: address.paymentCredential.PublicKeyCredential[0] }
      : { type: 'Script', hash: address.paymentCredential.ScriptCredential[0] };
  const stakeCredential: Credential | undefined =
    address.stakeCredential && 'Inline' in address.stakeCredential
      ? 'PublicKeyCredential' in address.stakeCredential.Inline[0]
        ? {
            type: 'Key',
            hash: address.stakeCredential.Inline[0].PublicKeyCredential[0],
          }
        : {
            type: 'Script',
            hash: address.stakeCredential.Inline[0].ScriptCredential[0],
          }
      : undefined;

  return credentialToAddress(
    lucid.config().network!,
    paymentCredential,
    stakeCredential,
  );
}

export function spAddressFromBech32(address: string): AddressD {
  const details = getAddressDetails(address);

  const matchCred = (cred: Credential): CredentialD => {
    return match(cred)
      .returnType<CredentialD>()
      .with({ type: 'Key', hash: P.select() }, (pkh) => {
        return {
          PublicKeyCredential: [pkh],
        };
      })
      .with({ type: 'Script', hash: P.select() }, (scriptHash) => ({
        ScriptCredential: [scriptHash],
      }))
      .exhaustive();
  };

  return match(details)
    .returnType<AddressD>()
    .with(
      { paymentCredential: P.nullish },
      { type: P.not(P.union('Base', 'Enterprise')) },
      (_) => {
        throw new Error('Invalid address provided');
      },
    )
    .narrow()
    .otherwise((details) => ({
      paymentCredential: matchCred(details.paymentCredential),
      stakeCredential: details.stakeCredential
        ? {
            Inline: [matchCred(details.stakeCredential)],
          }
        : null,
    }));
}

export const SPIntegerSchema = Data.Object({
  value: Data.Integer(),
});

export type SPInteger = Data.Static<typeof SPIntegerSchema>;
export const SPInteger = SPIntegerSchema as unknown as SPInteger;

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
  SPIntegerSchema,
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
      throw new Error('Expected a SnapshotEpochToScaleToSum datum.');
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
