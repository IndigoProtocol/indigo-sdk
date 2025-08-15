import {
  fromText,
  LucidEvolution,
  mintingPolicyToId,
  PolicyId,
  toText,
  validatorToAddress,
} from '@lucid-evolution/lucid';
import {
  addrDetails,
  AssetClass,
  AssetClassSP,
  CollectorContract,
  CollectorParams,
  runOneShotMintTx,
  StabilityPoolContract,
  StabilityPoolParams,
  StakingParams,
  SystemParams,
  TreasuryParams,
} from '../../src';
import { mkAuthTokenPolicy } from '../../src/scripts/auth-token-policy';
import { StakingContract } from '../../src/contracts/staking';
import { serialiseStakingDatum } from '../../src/types/indigo/staking';

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
    };
  };
  initerestOracle: {
    tokenName: string;
    initialUnitaryInterest: bigint;
    initialInterestRate: bigint;
    initialLastInterestUpdate: bigint;
    params: {
      biasTime: bigint;
    };
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
};

const initialAssets: InitialAsset[] = [];

export async function init(lucid: LucidEvolution): Promise<SystemParams> {
  const [pkh, skh] = await addrDetails(lucid);

  const indyAsset: AssetClass = {
    currencySymbol: await mintOneTimeToken(
      lucid,
      fromText(indyTokenName),
      totalIndySupply,
    ),
    tokenName: fromText(indyTokenName),
  };

  const daoAsset: AssetClass = {
    currencySymbol: await mintOneTimeToken(lucid, fromText(daoTokenName), 1n),
    tokenName: fromText(daoTokenName),
  };

  const govNftAsset: AssetClass = {
    currencySymbol: await mintOneTimeToken(
      lucid,
      fromText(govNftTokenName),
      1n,
    ),
    tokenName: fromText(govNftTokenName),
  };

  const pollTokenPolicy = mkAuthTokenPolicy(
    govNftAsset,
    fromText(pollManagerTokenName),
  );
  const pollToken: AssetClass = {
    currencySymbol: mintingPolicyToId(pollTokenPolicy),
    tokenName: fromText(pollManagerTokenName),
  };

  const upgradeTokenPolicy = mkAuthTokenPolicy(
    govNftAsset,
    fromText(upgradeTokenName),
  );
  const upgradeToken: AssetClass = {
    currencySymbol: mintingPolicyToId(upgradeTokenPolicy),
    tokenName: fromText(upgradeTokenName),
  };

  const iassetTokenPolicy = mkAuthTokenPolicy(
    upgradeToken,
    fromText(iassetTokenName),
  );
  const iassetToken: AssetClass = {
    currencySymbol: mintingPolicyToId(iassetTokenPolicy),
    tokenName: fromText(iassetTokenName),
  };

  const stabilityPoolTokenPolicy = mkAuthTokenPolicy(
    upgradeToken,
    fromText(stabilityPoolTokenName),
  );
  const stabilityPoolToken: AssetClass = {
    currencySymbol: mintingPolicyToId(stabilityPoolTokenPolicy),
    tokenName: fromText(stabilityPoolTokenName),
  };

  // TODO: Create Version Record Token Policy
  const versionRecordToken: AssetClass = govNftAsset;

  const cdpCreatorAsset: AssetClass = {
    currencySymbol: await mintOneTimeToken(
      lucid,
      fromText(cdpCreatorTokenName),
      10n,
    ),
    tokenName: fromText(cdpCreatorTokenName),
  };

  const cdpTokenPolicy = mkAuthTokenPolicy(
    cdpCreatorAsset,
    fromText(cdpTokenName),
  );
  const cdpToken: AssetClass = {
    currencySymbol: mintingPolicyToId(cdpTokenPolicy),
    tokenName: fromText(cdpTokenName),
  };

  const stakingManagerAsset: AssetClass = {
    currencySymbol: await mintOneTimeToken(
      lucid,
      fromText(stakingManagerTokenName),
      1n,
    ),
    tokenName: fromText(stakingManagerTokenName),
  };

  const stakingTokenPolicy = mkAuthTokenPolicy(
    stakingManagerAsset,
    fromText(stakingTokenName),
  );
  const stakingToken: AssetClass = {
    currencySymbol: mintingPolicyToId(stakingTokenPolicy),
    tokenName: fromText(stakingTokenName),
  };

  const collectorParams: CollectorParams = {
    stakingManagerNFT: toSystemParamsAsset(stakingManagerAsset),
    stakingToken: toSystemParamsAsset(stakingToken),
    versionRecordToken: toSystemParamsAsset(versionRecordToken),
  };
  const collectorValHash = CollectorContract.validatorHash(collectorParams);

  const stakingParams: StakingParams = {
    stakingManagerNFT: toSystemParamsAsset(stakingManagerAsset),
    stakingToken: toSystemParamsAsset(stakingToken),
    versionRecordToken: toSystemParamsAsset(versionRecordToken),
    pollToken: toSystemParamsAsset(pollToken),
    indyToken: toSystemParamsAsset(indyAsset),
    collectorValHash: collectorValHash,
  };

  await initStakingManager(lucid, stakingParams);

  // TODO: Asset Symbol from iAsset Policy
  const assetSymbol = await mintOneTimeToken(
    lucid,
    fromText(iassetTokenName),
    1n,
  );

  const snapshotEpochToScaleToSumTokenPolicy = mkAuthTokenPolicy(
    stabilityPoolToken,
    fromText(snapshotEpochToScaleToSumTokenName),
  );
  const snapshotEpochToScaleToSumToken: AssetClass = {
    currencySymbol: mintingPolicyToId(snapshotEpochToScaleToSumTokenPolicy),
    tokenName: fromText(snapshotEpochToScaleToSumTokenName),
  };

  const accountTokenPolicy = mkAuthTokenPolicy(
    stabilityPoolToken,
    fromText(accountTokenName),
  );
  const accountToken: AssetClass = {
    currencySymbol: mintingPolicyToId(accountTokenPolicy),
    tokenName: fromText(accountTokenName),
  };

  const stabilityPoolParams: StabilityPoolParams = {
    assetSymbol: { unCurrencySymbol: assetSymbol },
    stabilityPoolToken: toSystemParamsAsset(stabilityPoolToken),
    snapshotEpochToScaleToSumToken: toSystemParamsAsset(
      snapshotEpochToScaleToSumToken,
    ),
    accountToken: toSystemParamsAsset(accountToken),
    cdpToken: toSystemParamsAsset(cdpToken),
    iAssetAuthToken: toSystemParamsAsset(iassetToken),
    versionRecordToken: toSystemParamsAsset(versionRecordToken),
    collectorValHash: collectorValHash,
    govNFT: toSystemParamsAsset(govNftAsset),
    accountCreateFeeLovelaces: 5_000_000,
    accountAdjustmentFeeLovelaces: 5_000_000,
    requestCollateralLovelaces: 5_000_000,
  };
  const stabilityPoolValHash =
    StabilityPoolContract.validatorHash(stabilityPoolParams);

  const treasuryParams: TreasuryParams = {
    upgradeToken: toSystemParamsAsset(upgradeToken),
    versionRecordToken: toSystemParamsAsset(versionRecordToken),
    treasuryUtxosStakeCredential: null
  };

  await initTreasury(lucid, treasuryParams, daoAsset, indyAsset, treasuryIndyAmount);

  return {
    collectorParams: collectorParams,
    stakingParams: stakingParams,
    stabilityPoolParams: stabilityPoolParams,
    treasuryParams: treasuryParams,
  } as SystemParams;
}

async function mintOneTimeToken(
  lucid: LucidEvolution,
  tokenName: string,
  amount: bigint,
): Promise<PolicyId> {
  const utxos = await lucid.wallet().getUtxos();
  return await runOneShotMintTx(lucid, {
    referenceOutRef: {
      txHash: utxos[0].txHash,
      outputIdx: BigInt(utxos[0].outputIndex),
    },
    mintAmounts: [{ tokenName: tokenName, amount: amount }],
  });
}

async function initTreasury(lucid: LucidEvolution, treasuryParams: TreasuryParams, daoAsset: AssetClass, indyAsset: AssetClass, treasuryIndyAmount: bigint): Promise<void> {

}

async function initStakingManager(
  lucid: LucidEvolution,
  stakingParams: StakingParams,
): Promise<void> {
  const txHash = await lucid
    .newTx()
    .pay.ToContract(
      StakingContract.address(stakingParams, lucid),
      {
        kind: 'inline',
        value: serialiseStakingDatum({
          StakingManager: {
            content: { totalStake: 0n, managerSnapshot: { snapshotAda: 0n } },
          },
        }),
      },
      {
        [stakingParams.stakingManagerNFT[0].unCurrencySymbol +
        fromText(stakingParams.stakingManagerNFT[1].unTokenName)]: 1n,
      },
    )
    .complete()
    .then((tx) => tx.sign.withWallet().complete())
    .then((tx) => tx.submit());

  await lucid.awaitTx(txHash);
}

function toSystemParamsAsset(asset: AssetClass): AssetClassSP {
  return [
    { unCurrencySymbol: asset.currencySymbol },
    { unTokenName: toText(asset.tokenName) },
  ];
}
