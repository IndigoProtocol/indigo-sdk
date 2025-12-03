import { Core as EvoCore } from '@evolution-sdk/evolution';
import { DEFAULT_SCHEMA_OPTIONS } from '../../types/evolution-schema-options';

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
  return EvoCore.Data.withSchema(
    VersionRecordDatumSchema,
    DEFAULT_SCHEMA_OPTIONS,
  ).toCBORHex(d);
}
