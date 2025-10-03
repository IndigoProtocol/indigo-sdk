import { Data, Datum } from '@lucid-evolution/lucid';
import { AssetClassSchema } from '../generic';
import { OnChainDecimalSchema } from '../on-chain-decimal';
import { OracleAssetNftSchema } from './price-oracle';
import { match, P } from 'ts-pattern';
import { option as O, function as F } from 'fp-ts';

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
  Data.Object({ Delisted: OnChainDecimalSchema }),
  Data.Object({
    Oracle: OracleAssetNftSchema,
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

export function parseCDPDatum(datum: Datum): CDPContent {
  return match(Data.from<CDPDatum>(datum, CDPDatum))
    .with({ CDP: { content: P.select() } }, (res) => res)
    .otherwise(() => {
      throw new Error('Expected an CDP datum.');
    });
}

export function serialiseCDPDatum(cdpDatum: CDPContent): Datum {
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
