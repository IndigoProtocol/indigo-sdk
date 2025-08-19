import { Data } from '@lucid-evolution/lucid';
import { AssetClassSchema } from '../generic';

const ExecuteParamsSchema = Data.Object({
  govNFT: AssetClassSchema,
  upgradeToken: AssetClassSchema,
  iAssetToken: AssetClassSchema,
  stabilityPoolToken: AssetClassSchema,
  versionRecordToken: AssetClassSchema,
  cdpValHash: Data.Bytes(),
  sPoolValHash: Data.Bytes(),
  versionRegistryValHash: Data.Bytes(),
  treasuryValHash: Data.Bytes(),
  indyAsset: AssetClassSchema,
});
export type ExecuteParams = Data.Static<typeof ExecuteParamsSchema>;
export const ExecuteParams = ExecuteParamsSchema as unknown as ExecuteParams;

export function castExecuteParams(params: ExecuteParams): Data {
  return Data.castTo(params, ExecuteParams);
}
