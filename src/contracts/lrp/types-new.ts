import { Core } from '@evolution-sdk/evolution';
import { DEFAULT_SCHEMA_OPTIONS } from '../../types/evolution-schema-options';

const TSchema = Core.TSchema;

const LRPRedeemerSchema = TSchema.Union(
  TSchema.Struct(
    {
      Redeem: TSchema.Struct(
        { continuingOutputIdx: TSchema.Integer },
        { flatFields: true },
      ),
    },
    { flatInUnion: true },
  ),
  TSchema.Struct(
    {
      RedeemAuxiliary: TSchema.Struct(
        {
          continuingOutputIdx: TSchema.Integer,
          mainRedeemOutRef: TSchema.Struct({
            txHash: TSchema.Struct({ hash: TSchema.ByteArray }),
            outputIndex: TSchema.Integer,
          }),
          asset: TSchema.ByteArray,
          assetPrice: Core.TSchema.Struct({
            getOnChainInt: Core.TSchema.Integer,
          }),
          redemptionReimbursementPercentage: Core.TSchema.Struct({
            getOnChainInt: Core.TSchema.Integer,
          }),
        },
        { flatFields: true },
      ),
    },
    { flatInUnion: true },
  ),
  TSchema.Literal('Cancel', { flatInUnion: true }),
  TSchema.Literal('UpgradeVersion', { flatInUnion: true }),
);

export type LRPRedeemer = typeof LRPRedeemerSchema.Type;

export function serialiseLrpRedeemer(r: LRPRedeemer): string {
  return Core.Data.withSchema(
    LRPRedeemerSchema,
    DEFAULT_SCHEMA_OPTIONS,
  ).toCBORHex(r);
}
