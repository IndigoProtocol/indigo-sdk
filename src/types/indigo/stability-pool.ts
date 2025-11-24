import { Data } from '@lucid-evolution/lucid';
import { AssetClassSchema, OutputReferenceSchema } from '../generic';

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
