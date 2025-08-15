import { Data, Datum } from '@lucid-evolution/lucid';
import { AssetClassSchema, mkMaybeSchema } from '../generic';
import { OnChainDecimalSchema } from '../on-chain-decimal';
import { OracleAssetNftSchema } from './price-oracle';
import { match, P } from 'ts-pattern';

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
  content: Data.Object({
    cdpOwner: mkMaybeSchema(Data.Bytes()),
    iasset: Data.Bytes(),
    mintedAmt: Data.Integer(),
    cdpFees: CDPFeesSchema,
  }),
});

export const IAssetContentSchema = Data.Object({
  content: Data.Object({
    /** Use the HEX encoding */
    assetName: Data.Bytes(),
    price: Data.Enum([
      Data.Object({ Delisted: OnChainDecimalSchema }),
      Data.Object({
        Oracle: OracleAssetNftSchema,
      }),
    ]),
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
    nextIAsset: mkMaybeSchema(Data.Bytes()),
  }),
});

export const CDPDatumSchema = Data.Enum([
  Data.Object({ CDP: CDPContentSchema }),
  Data.Object({ IAsset: IAssetContentSchema }),
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
    .with({ CDP: P.select() }, (res) => res)
    .otherwise(() => {
      throw new Error('Expected an CDP datum.');
    });
}

export function serialiseCDPDatum(cdpDatum: CDPContent): Datum {
  return Data.to<CDPDatum>({ CDP: cdpDatum }, CDPDatum);
}

export function parseIAssetDatum(datum: Datum): IAssetContent {
  return match(Data.from<CDPDatum>(datum, CDPDatum))
    .with({ IAsset: P.select() }, (res) => res)
    .otherwise(() => {
      throw new Error('Expected an IAsset datum.');
    });
}

export function serialiseIAssetDatum(iassetDatum: IAssetContent): Datum {
  return Data.to<CDPDatum>({ IAsset: iassetDatum }, CDPDatum);
}
