import { PriceOracleParams } from '../price-oracle/types';

/**
 * Configuration for an asset to be initialized on the Indigo Protocol.
 */
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
  interestOracle: {
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

/**
 * Result of initializing a single asset (iAsset + stability pool + oracles).
 */
export type AssetInfo = {
  iassetTokenNameAscii: string;
  oracleParams: PriceOracleParams;
};
