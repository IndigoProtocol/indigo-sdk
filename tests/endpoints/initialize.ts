import { fromText, LucidEvolution, mintingPolicyToId, PolicyId, validatorToAddress } from "@lucid-evolution/lucid";
import { addrDetails, AssetClass, CollectorContract, CollectorParams, runOneShotMintTx, StakingParams, SystemParams } from "../../src";
import { mkAuthTokenPolicy } from "../../src/scripts/auth-token-policy";
import { StakingContract } from "../../src/contracts/staking";

const indyTokenName = 'INDY';
const daoTokenName = 'DAO';
const govNftTokenName = 'GOV_NFT';
const pollManagerTokenName = 'POLL_MANAGER';
const pollShardTokenName = 'POLL_SHARD';
const upgradeTokenName = 'UPGRADE';
const iassetTokenName = 'IASSET';
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

export async function init(lucid: LucidEvolution): Promise<SystemParams> {
    const [pkh, skh] = await addrDetails(lucid);

    const indyAsset: AssetClass = {
        currencySymbol: await mintOneTimeToken(lucid, fromText(indyTokenName), totalIndySupply),
        tokenName: fromText(indyTokenName),
    }

    const daoAsset: AssetClass = {
        currencySymbol: await mintOneTimeToken(lucid, fromText(daoTokenName), 1n),
        tokenName: fromText(daoTokenName),
    }

    const govNftAsset: AssetClass = {
        currencySymbol: await mintOneTimeToken(lucid, fromText(govNftTokenName), 1n),
        tokenName: fromText(govNftTokenName),
    }

    const pollTokenPolicy = mkAuthTokenPolicy(govNftAsset, fromText(pollManagerTokenName));
    const pollToken: AssetClass = {
        currencySymbol: mintingPolicyToId(pollTokenPolicy),
        tokenName: fromText(pollManagerTokenName),
    }

    const upgradeTokenPolicy = mkAuthTokenPolicy(govNftAsset, fromText(upgradeTokenName));
    const upgradeToken: AssetClass = {
        currencySymbol: mintingPolicyToId(upgradeTokenPolicy),
        tokenName: fromText(upgradeTokenName),
    }

    const iassetTokenPolicy = mkAuthTokenPolicy(upgradeToken, fromText(iassetTokenName));
    const iassetToken: AssetClass = {
        currencySymbol: mintingPolicyToId(iassetTokenPolicy),
        tokenName: fromText(iassetTokenName),
    }

    const stabilityPoolTokenPolicy = mkAuthTokenPolicy(upgradeToken, fromText(stabilityPoolTokenName));
    const stabilityPoolToken: AssetClass = {
        currencySymbol: mintingPolicyToId(stabilityPoolTokenPolicy),
        tokenName: fromText(stabilityPoolTokenName),
    }

    // TODO: Create Version Record Token Policy
    const versionRecordToken: AssetClass = govNftAsset;

    const cdpCreatorAsset: AssetClass = {
        currencySymbol: await mintOneTimeToken(lucid, fromText(cdpCreatorTokenName), 10n),
        tokenName: fromText(cdpCreatorTokenName),
    }
    
    const cdpTokenPolicy = mkAuthTokenPolicy(cdpCreatorAsset, fromText(cdpTokenName));
    const cdpToken: AssetClass = {
        currencySymbol: mintingPolicyToId(cdpTokenPolicy),
        tokenName: fromText(cdpTokenName),
    }

    const stakingManagerAsset: AssetClass = {
        currencySymbol: await mintOneTimeToken(lucid, fromText(stakingManagerTokenName), 1n),
        tokenName: fromText(stakingManagerTokenName),
    }

    const stakingTokenPolicy = mkAuthTokenPolicy(stakingManagerAsset, fromText(stakingTokenName));
    const stakingToken: AssetClass = {
        currencySymbol: mintingPolicyToId(stakingTokenPolicy),
        tokenName: fromText(stakingTokenName),
    }

    const collectorParams: CollectorParams = {
        stakingManagerNFT: stakingManagerAsset,
        stakingToken: stakingToken,
        versionRecordToken: versionRecordToken
    };
    const collectorValHash = CollectorContract.validatorHash(collectorParams);

    const stakingParams: StakingParams = {
        stakingManagerNFT: stakingManagerAsset,
        stakingToken: stakingToken,
        versionRecordToken: versionRecordToken,
        pollToken: pollToken,
        indyToken: indyAsset,
        collectorValHash: collectorValHash,
    };

    await initStakingManager(lucid, stakingParams);

    return {
        collectorParams: collectorParams,
        stakingParams: stakingParams,
        // TODO: Fill out rest of 
    } as SystemParams;
}

async function mintOneTimeToken(lucid: LucidEvolution, tokenName: string, amount: bigint): Promise<PolicyId> {
    const utxos = await lucid.wallet().getUtxos();
    return await runOneShotMintTx(lucid, {
      referenceOutRef: {
        txHash: utxos[0].txHash,
        outputIdx: BigInt(utxos[0].outputIndex),
      },
      mintAmounts: [{ tokenName: tokenName, amount: amount }],
    });
}

async function initStakingManager(lucid: LucidEvolution, stakingParams: StakingParams): Promise<void> {
    const txHash = await lucid.newTx()
        .pay.ToContract(
            StakingContract.address(stakingParams, lucid),
            { kind: 'inline',  value: StakingContract.encodeDatum({type: 'StakingManager', totalStaked: 0n, snapshot: { snapshotAda: 0n}})},
            { [stakingParams.stakingManagerNFT.currencySymbol + fromText(stakingParams.stakingManagerNFT.tokenName)]: 1n }
        )
        .complete()
        .then((tx) => tx.sign.withWallet().complete())
        .then((tx) => tx.submit());

    await lucid.awaitTx(txHash);
}