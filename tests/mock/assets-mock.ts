export type InitialAsset = {
  name: string;
  priceOracle: {
    tokenName: string;
    startPrice: bigint;
    params: {
      biasTime: bigint;
      expirationTime: bigint;
    };
  };
  initerestOracle: {
    tokenName: string;
    initialInterestRate: bigint;
    params: {
      biasTime: bigint;
    };
  };
  redemptionRatioPercentage: bigint;
  maintenanceRatioPercentage: bigint;
  liquidationRatioPercentage: bigint;
  debtMintingFeePercentage: bigint;
  liquidationProcessingFeePercentage: bigint;
  stabilityPoolWithdrawalFeePercentage: bigint;
  redemptionReimbursementPercentage: bigint;
  redemptionProcessingFeePercentage: bigint;
  interestCollectorPortionPercentage: bigint;
  firstAsset: boolean;
  nextAsset?: string;
};

export const iusdInitialAssetCfg: InitialAsset = {
  name: 'iUSD',
  priceOracle: {
    tokenName: 'iUSD_ORACLE',
    startPrice: 1_000_000n,
    params: {
      biasTime: 120_000n,
      expirationTime: 1_800_000n,
    },
  },
  initerestOracle: {
    tokenName: 'iUSD_ORACLE',
    initialInterestRate: 1_000_000n,
    params: {
      biasTime: 120_000n,
    },
  },
  redemptionRatioPercentage: 200_000_000n,
  maintenanceRatioPercentage: 150_000_000n,
  liquidationRatioPercentage: 120_000_000n,
  debtMintingFeePercentage: 500_000n,
  liquidationProcessingFeePercentage: 2_000_000n,
  stabilityPoolWithdrawalFeePercentage: 500_000n,
  redemptionReimbursementPercentage: 1_000_000n,
  redemptionProcessingFeePercentage: 1_000_000n,
  interestCollectorPortionPercentage: 40_000_000n,
  firstAsset: true,
  nextAsset: undefined,
};
