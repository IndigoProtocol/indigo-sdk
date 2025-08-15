import { LucidEvolution } from "@lucid-evolution/lucid";
import { addrDetails } from "../../src";

const indyTokenName = 'INDY';
const daoTokenName = 'DAO';
const govNftTokenName = 'GOV_NFT';
const pollManagerTokenName = 'POLL_MANAGER';
const pollShardTokenName = 'POLL_SHARD';
const upgradeTokenName = 'UPGRADE';
const iAssetTokenName = 'IASSET';
const stabilityPoolTokenName = 'STABILITY_POOL';
const versionRecordTokenName = 'VERSION_RECORD';
const cdpCreatorTokenName = 'CDP_CREATOR';
const cdpTokenName = 'CDP';
const stakingManagerTokenName = 'STAKING_MANAGER';
const stakingTokenName = 'STAKING_POSITION';
const snapshotEpochToScaleToSumTokenName = 'SNAPSHOT_EPOCH_TO_SCALE_TO_SUM';
const accountTokenName = 'SP_ACCOUNT';

const totalIndySupply = 35000000000000n;
const totalIndyDistribution = 0n;
const treasuryIndyAmount = 0n;

type InitialAsset = {
    name: string;
    priceOracle: {
        tokenName: string;
        startPrice: bigint;
        params: {
            biasTime: bigint;
            expirationTime: bigint;
        }
    };
    initerestOracle: {
        tokenName: string;
        initialUnitaryInterest: bigint;
        initialInterestRate: bigint;
        initialLastInterestUpdate: bigint;
        params: {
            biasTime: bigint;
        }
    };
    redemptionRatioPercentage: bigint;
    maintenanceRatioPercentage: bigint;
    liquidationRatioPercentage: bigint;
    debtMintingFeePercentage: bigint;
    liquidationProcessingFeePercentage: bigint;
    stabilityPoolWithdrawalFeePercenta: bigint;
    redemptionReimbursementPercentage: bigint;
    redemptionProcessingFeePercentage: bigint;
    interestCollectorPortionPercentage: bigint;
    firstAsset: boolean;
    nextAsset?: string;
}

const initialAssets: InitialAsset[] = [];

export async function init(lucid: LucidEvolution): Promise<any> {
    const [pkh, skh] = await addrDetails(lucid);

    mintOneTimeToken(lucid, indyTokenName, totalIndySupply);
}

// TODO: Replace with OneShotPolicy Token
async function mintOneTimeToken(lucid: LucidEvolution, tokenName: string, amount: bigint): Promise<any> {
    const [pkh, skh] = await addrDetails(lucid);

}