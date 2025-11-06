import { Data, TSchema } from '@evolution-sdk/evolution';

const VersionRecordDatumSchema = TSchema.Struct({
  upgradeId: TSchema.Integer,
  /// Underlying representation of the following mapping: ValidatorHash -> UpgradePath
  upgradePaths: TSchema.Map(TSchema.ByteArray, TSchema.ByteArray),
});
export type VersionRecordDatum = typeof VersionRecordDatumSchema.Type;

export function serialiseVersionRecordDatum(d: VersionRecordDatum): string {
  return Data.withSchema(VersionRecordDatumSchema).toCBORHex(d, {
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
