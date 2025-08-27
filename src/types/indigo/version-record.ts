import { Data } from '@lucid-evolution/lucid';
import { AssetClassSchema } from '../generic';

const VersionRecordTokenParamsSchema = Data.Object({
  upgradeToken: AssetClassSchema,
});
export type VersionRecordTokenParams = Data.Static<
  typeof VersionRecordTokenParamsSchema
>;
export const VersionRecordTokenParams =
  VersionRecordTokenParamsSchema as unknown as VersionRecordTokenParams;

export function castVersionRecordTokenParams(
  params: VersionRecordTokenParams,
): Data {
  return Data.castTo(params, VersionRecordTokenParams);
}
