import { Core as EvoCore } from '@evolution-sdk/evolution';

const VersionRecordDatumSchema = EvoCore.TSchema.Struct({
  upgradeId: EvoCore.TSchema.Integer,
  /// Underlying representation of the following mapping: ValidatorHash -> UpgradePath
  upgradePaths: EvoCore.TSchema.Map(
    EvoCore.TSchema.ByteArray,
    EvoCore.TSchema.ByteArray,
  ),
});
export type VersionRecordDatum = typeof VersionRecordDatumSchema.Type;

export function serialiseVersionRecordDatum(d: VersionRecordDatum): string {
  return EvoCore.Data.withSchema(VersionRecordDatumSchema, {
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
