import { Data, Datum, Redeemer } from '@lucid-evolution/lucid';
import { AssetClassSchema, OutputReferenceSchema } from '../generic';
import { OnChainDecimalSchema } from '../on-chain-decimal';

export const LRPParamsSchema = Data.Object({
  versionRecordToken: AssetClassSchema,
  iassetNft: AssetClassSchema,
  iassetPolicyId: Data.Bytes(),
  minRedemptionLovelacesAmt: Data.Integer(),
});
export type LRPParams = Data.Static<typeof LRPParamsSchema>;
const LRPParams = LRPParamsSchema as unknown as LRPParams;

export const LRPDatumSchema = Data.Object({
  owner: Data.Bytes(),
  iasset: Data.Bytes(),
  maxPrice: OnChainDecimalSchema,
  /**
   * The amount of lovelaces that is available to be spent.
   * This doesn't correspond to the lovelaces in UTXO's value,
   * since that can contain fees, too.
   */
  lovelacesToSpend: Data.Integer(),
});
export type LRPDatum = Data.Static<typeof LRPDatumSchema>;
const LRPDatum = LRPDatumSchema as unknown as LRPDatum;

export const LRPRedeemerSchema = Data.Enum([
  Data.Object({ Redeem: Data.Object({ continuingOutputIdx: Data.Integer() }) }),
  Data.Object({
    RedeemAuxiliary: Data.Object({
      continuingOutputIdx: Data.Integer(),
      mainRedeemOutRef: OutputReferenceSchema,
      asset: Data.Bytes(),
      assetPrice: OnChainDecimalSchema,
      redemptionReimbursementPercentage: OnChainDecimalSchema,
    }),
  }),
  Data.Literal('Cancel'),
  Data.Literal('UpgradeVersion'),
]);
export type LRPRedeemer = Data.Static<typeof LRPRedeemerSchema>;
const LRPRedeemer = LRPRedeemerSchema as unknown as LRPRedeemer;

export function parseLrpDatum(datum: Datum): LRPDatum {
  return Data.from<LRPDatum>(datum, LRPDatum);
}

export function serialiseLrpDatum(datum: LRPDatum): Datum {
  return Data.to<LRPDatum>(datum, LRPDatum);
}

export function serialiseLrpRedeemer(redeemer: LRPRedeemer): Redeemer {
  return Data.to<LRPRedeemer>(redeemer, LRPRedeemer, { canonical: true });
}

export function castLrpParams(params: LRPParams): Data {
  return Data.castTo(params, LRPParams);
}
