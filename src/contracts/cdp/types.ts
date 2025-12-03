import { Data, Datum, Redeemer, UTxO } from '@lucid-evolution/lucid';
import { AssetClassSchema, OutputReferenceSchema } from '../../types/generic';
import { OnChainDecimalSchema } from '../../types/on-chain-decimal';
import { OracleAssetNftSchema } from '../price-oracle/types';
import { match, P } from 'ts-pattern';
import { option as O, function as F } from 'fp-ts';

const CdpParamsSchema = Data.Object({
  cdp_auth_token: AssetClassSchema,
  cdp_asset_symbol: Data.Bytes(),
  iasset_auth_token: AssetClassSchema,
  stability_pool_auth_token: AssetClassSchema,
  version_record_token: AssetClassSchema,
  upgrade_token: AssetClassSchema,
  collector_val_hash: Data.Bytes(),
  sp_val_hash: Data.Bytes(),
  gov_nft: AssetClassSchema,
  min_collateral_in_lovelace: Data.Integer(),
  partial_redemption_extra_fee_lovelace: Data.Integer(),
  bias_time: Data.Integer(),
  treasury_val_hash: Data.Bytes(),
});
export type CdpParams = Data.Static<typeof CdpParamsSchema>;
const CdpParams = CdpParamsSchema as unknown as CdpParams;

export const CDPFeesSchema = Data.Enum([
  Data.Object({
    ActiveCDPInterestTracking: Data.Object({
      lastSettled: Data.Integer(),
      unitaryInterestSnapshot: Data.Integer(),
    }),
  }),
  Data.Object({
    FrozenCDPAccumulatedFees: Data.Object({
      lovelacesTreasury: Data.Integer(),
      lovelacesIndyStakers: Data.Integer(),
    }),
  }),
]);

export const CDPContentSchema = Data.Object({
  cdpOwner: Data.Nullable(Data.Bytes()),
  iasset: Data.Bytes(),
  mintedAmt: Data.Integer(),
  cdpFees: CDPFeesSchema,
});

export const IAssetPriceInfoSchema = Data.Enum([
  Data.Object({
    Delisted: Data.Object({ content: OnChainDecimalSchema }),
  }),
  Data.Object({
    Oracle: Data.Object({ content: OracleAssetNftSchema }),
  }),
]);

export const IAssetContentSchema = Data.Object({
  /** Use the HEX encoding */
  assetName: Data.Bytes(),
  price: IAssetPriceInfoSchema,
  interestOracleNft: AssetClassSchema,
  redemptionRatio: OnChainDecimalSchema,
  maintenanceRatio: OnChainDecimalSchema,
  liquidationRatio: OnChainDecimalSchema,
  debtMintingFeePercentage: OnChainDecimalSchema,
  liquidationProcessingFeePercentage: OnChainDecimalSchema,
  stabilityPoolWithdrawalFeePercentage: OnChainDecimalSchema,
  redemptionReimbursementPercentage: OnChainDecimalSchema,
  redemptionProcessingFeePercentage: OnChainDecimalSchema,
  interestCollectorPortionPercentage: OnChainDecimalSchema,
  firstIAsset: Data.Boolean(),
  nextIAsset: Data.Nullable(Data.Bytes()),
});

export const CDPDatumSchema = Data.Enum([
  Data.Object({ CDP: Data.Object({ content: CDPContentSchema }) }),
  Data.Object({ IAsset: Data.Object({ content: IAssetContentSchema }) }),
]);

export type CDPFees = Data.Static<typeof CDPFeesSchema>;
export type CDPDatum = Data.Static<typeof CDPDatumSchema>;
const CDPDatum = CDPDatumSchema as unknown as CDPDatum;

export type CDPContent = Data.Static<typeof CDPContentSchema>;
const CDPContent = CDPContentSchema as unknown as CDPContent;
export type IAssetContent = Data.Static<typeof IAssetContentSchema>;
const IAssetContent = IAssetContentSchema as unknown as IAssetContent;

const CDPRedeemerSchema = Data.Enum([
  Data.Object({
    AdjustCdp: Data.Object({
      currentTime: Data.Integer(),
      mintedAmtChange: Data.Integer(),
      collateralAmtChange: Data.Integer(),
    }),
  }),
  Data.Object({ CloseCdp: Data.Object({ currentTime: Data.Integer() }) }),
  Data.Object({ RedeemCdp: Data.Object({ currentTime: Data.Integer() }) }),
  Data.Object({ FreezeCdp: Data.Object({ currentTime: Data.Integer() }) }),
  Data.Literal('MergeCdps'),
  Data.Object({
    MergeAuxiliary: Data.Object({ mainMergeUtxo: OutputReferenceSchema }),
  }),
  Data.Literal('Liquidate'),
  Data.Literal('UpdateOrInsertAsset'),
  Data.Literal('UpgradeVersion'),
]);
export type CDPRedeemer = Data.Static<typeof CDPRedeemerSchema>;
const CDPRedeemer = CDPRedeemerSchema as unknown as CDPRedeemer;

export function serialiseCdpRedeemer(r: CDPRedeemer): Redeemer {
  return Data.to<CDPRedeemer>(r, CDPRedeemer);
}

export function parseCdpDatum(datum: Datum): O.Option<CDPContent> {
  return match(Data.from<CDPDatum>(datum, CDPDatum))
    .with({ CDP: { content: P.select() } }, (res) => O.some(res))
    .otherwise(() => O.none);
}

export function parseCdpDatumOrThrow(datum: Datum): CDPContent {
  return F.pipe(
    parseCdpDatum(datum),
    O.match(() => {
      throw new Error('Expected a CDP datum.');
    }, F.identity),
  );
}

export function serialiseCdpDatum(cdpDatum: CDPContent): Datum {
  return Data.to<CDPDatum>({ CDP: { content: cdpDatum } }, CDPDatum);
}

export function parseIAssetDatum(datum: Datum): O.Option<IAssetContent> {
  try {
    return match(Data.from<CDPDatum>(datum, CDPDatum))
      .with({ IAsset: { content: P.select() } }, (res) => O.some(res))
      .otherwise(() => O.none);
  } catch (_) {
    return O.none;
  }
}

export function parseIAssetDatumOrThrow(datum: Datum): IAssetContent {
  return F.pipe(
    parseIAssetDatum(datum),
    O.match(() => {
      throw new Error('Expected an IAsset datum.');
    }, F.identity),
  );
}

export function serialiseIAssetDatum(iassetDatum: IAssetContent): Datum {
  return Data.to<CDPDatum>({ IAsset: { content: iassetDatum } }, CDPDatum);
}

export function castCdpParams(params: CdpParams): Data {
  return Data.castTo(params, CdpParams);
}

export type IAssetOutput = { datum: IAssetContent; utxo: UTxO };
