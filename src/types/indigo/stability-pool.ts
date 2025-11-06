import { Data } from '@lucid-evolution/lucid';
import {
  AddressSchema,
  AssetClassSchema,
  cborToEvoData,
  evoDataToCbor,
  OutputReferenceSchema,
} from '../generic';
import { Data as EvoData } from '@evolution-sdk/evolution';

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

export function serialiseAccountAction(d: AccountAction): EvoData.Data {
  return cborToEvoData(Data.to<AccountAction>(d, AccountAction));
}

export function parseAccountAction(d: EvoData.Data): AccountAction {
  return Data.from<AccountAction>(evoDataToCbor(d), AccountAction);
}

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
  return Data.to<StabilityPoolRedeemer>(params, StabilityPoolRedeemer);
}

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
