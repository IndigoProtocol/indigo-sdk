import { Core } from '@evolution-sdk/evolution';
import { DEFAULT_SCHEMA_OPTIONS } from '../../types/evolution-schema-options';
import { option as O, function as F } from 'fp-ts';
import { AIKEN_DEFAULT_OPTIONS } from '@evolution-sdk/evolution/core/CBOR';

const TSchema = Core.TSchema;

const LRPDatumSchema = TSchema.Struct({
  owner: TSchema.ByteArray,
  iasset: TSchema.ByteArray,
  maxPrice: Core.TSchema.Struct({
    getOnChainInt: Core.TSchema.Integer,
  }),
  /**
   * The amount of lovelaces that is available to be spent.
   * This doesn't correspond to the lovelaces in UTXO's value,
   * since that can contain fees, too.
   */
  lovelacesToSpend: TSchema.Integer,
});

export type LRPDatum = typeof LRPDatumSchema.Type;

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

export function parseLrpDatum(datum: string): O.Option<LRPDatum> {
  try {
    return O.some(
      Core.Data.withSchema(LRPDatumSchema, DEFAULT_SCHEMA_OPTIONS).fromCBORHex(
        datum,
      ),
    );
  } catch (_) {
    return O.none;
  }
}

export function parseLrpDatumOrThrow(datum: string): LRPDatum {
  return F.pipe(
    parseLrpDatum(datum),
    O.match(() => {
      throw new Error('Expected an LRP datum.');
    }, F.identity),
  );
}

export function serialiseLrpDatum(d: LRPDatum): string {
  let datum = Core.Data.withSchema(LRPDatumSchema, {
    mode: 'canonical',
  }).toCBORHex(d);

  datum = datum.replace('d87984', 'd8799f');
  datum = datum + 'ff';

  return datum;
}

export function serialiseLrpRedeemer(r: LRPRedeemer): string {
  const redeemer = Core.Data.withSchema(LRPRedeemerSchema, {
    mode: 'canonical',
  }).toCBORHex(r);

  return redeemer;
}
