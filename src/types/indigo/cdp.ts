import { Data } from '@lucid-evolution/lucid';
import { AssetClassSchema, OnChainDecimalSchema } from '../generic';

// iAsset
export const CDPContentSchema = Data.Object({
  owner: Data.Nullable(Data.Bytes()),
  asset: Data.Bytes(),
  mintedAmount: Data.Integer(),
  fees: Data.Enum([
    Data.Object({
      ActiveCDPInterestTracking: Data.Object({
        last_settled: Data.Integer(),
        unitary_interest_snapshot: Data.Integer(),
      }),
    }),
    Data.Object({
      FrozenCDPAccumulatedFees: Data.Object({
        lovelaces_treasury: Data.Integer(),
        lovelaces_indy_stakers: Data.Integer(),
      }),
    }),
  ]),
});

export type CDPContent = Data.Static<typeof CDPContentSchema>;
export const CDPContent = CDPContentSchema as unknown as CDPContent;

// iAsset
export const IAssetContentSchema = Data.Object({
  name: Data.Bytes(),
  price: Data.Enum([
    Data.Object({ Delisted: OnChainDecimalSchema }),
    Data.Object({
      Reference: Data.Object({
        OracleAssetNft: Data.Object({
            AssetClass: AssetClassSchema,
        }),
      }),
    }),
  ]),
  interestOracle: AssetClassSchema,
  redemptionRatioPercentage: OnChainDecimalSchema,
  maintenanceRatioPercentage: OnChainDecimalSchema,
  liquidationRatioPercentage: OnChainDecimalSchema,
  debtMintingFeePercentage: OnChainDecimalSchema,
  liquidationProcessingFeePercentage: OnChainDecimalSchema,
  stabilityPoolWithdrawalFeePercentage: OnChainDecimalSchema,
  redemptionReimbursementPercentage: OnChainDecimalSchema,
  redemptionProcessingFeePercentage: OnChainDecimalSchema,
  interestCollectorPortionPercentage: OnChainDecimalSchema,
  firstAsset: Data.Boolean(),
  nextAsset: Data.Nullable(Data.Bytes()),
});

export type IAssetContent = Data.Static<typeof IAssetContentSchema>;
export const IAssetContent = IAssetContentSchema as unknown as IAssetContent;

// CDP
export const CDPSchema = Data.Enum([
  Data.Object({
    CDP: Data.Object({
      data: CDPContentSchema,
    }),
  }),
  Data.Object({
    IAsset: Data.Object({
      data: IAssetContentSchema,
    }),
  }),
]);

export type CDP = Data.Static<typeof CDPSchema>;
export const CDP = CDPSchema as unknown as CDP;
