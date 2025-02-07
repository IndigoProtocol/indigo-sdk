import { AssetClass, OnChainDecimal } from "../generic";

export type ActiveCDPInterestTracking = { type: 'ActiveCDPInterestTracking', last_settled: bigint, unitary_interest_snapshot: bigint }
export type FrozenCDPAccumulatedFees = { type: 'FrozenCDPAccumulatedFees', lovelaces_treasury: bigint, lovelaces_indy_stakers: bigint }
export type CDPFees = ActiveCDPInterestTracking | FrozenCDPAccumulatedFees;

export type CDP = {
    type: 'CDP',
    owner: string | undefined,
    asset: string,
    mintedAmount: bigint,
    fees: CDPFees
}

export type IAsset = {
    type: 'IAsset';
    name: string;
    price: OnChainDecimal | AssetClass;
    interestOracle: AssetClass;
    redemptionRatioPercentage: OnChainDecimal;
    maintenanceRatioPercentage: OnChainDecimal;
    liquidationRatioPercentage: OnChainDecimal;
    debtMintingFeePercentage: OnChainDecimal;
    liquidationProcessingFeePercentage: OnChainDecimal;
    stabilityPoolWithdrawalFeePercentage: OnChainDecimal;
    redemptionReimbursementPercentage: OnChainDecimal;
    redemptionProcessingFeePercentage: OnChainDecimal;
    interestCollectorPortionPercentage: OnChainDecimal;
    firstAsset: boolean;
    nextAsset?: string;
};

export type CDPDatum = CDP | IAsset;