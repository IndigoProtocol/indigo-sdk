import {
  Constr,
  credentialToAddress,
  Data,
  fromText,
  LucidEvolution,
  mintingPolicyToId,
  PolicyId,
  SpendingValidator,
  validatorToAddress,
  validatorToScriptHash,
} from '@lucid-evolution/lucid';
import {
  addrDetails,
  AssetClass,
  CDPContract,
  CDPCreatorParamsSP,
  CdpParams,
  CollectorContract,
  CollectorParams,
  ExecuteParamsSP,
  GovDatum,
  GovParamsSP,
  IAssetContent,
  Input,
  InterestOracleDatum,
  InterestOracleParams,
  mkCDPCreatorValidatorFromSP,
  mkInterestOracleValidator,
  mkPollManagerValidatorFromSP,
  mkPollShardValidatorFromSP,
  PollManagerParamsSP,
  PollShardParamsSP,
  PriceOracleDatum,
  PriceOracleParams,
  runOneShotMintTx,
  serialiseGovDatum,
  serialiseIAssetDatum,
  serialiseInterestOracleDatum,
  serialisePriceOracleDatum,
  serialiseStabilityPoolDatum,
  StabilityPoolContent,
  StabilityPoolParamsSP,
  StakingParams,
  SystemParams,
  toSystemParamsAsset,
  TreasuryContract,
  TreasuryParams,
} from '../../src';
import { mkAuthTokenPolicy } from '../../src/scripts/auth-token-policy';
import { StakingContract } from '../../src/contracts/staking';
import { serialiseStakingDatum } from '../../src/types/indigo/staking';
import { mkIAssetTokenPolicy } from '../../src/scripts/iasset-policy';
import { mkPriceOracleValidator } from '../../src/scripts/price-oracle-validator';
import { mkVersionRecordTokenPolicy } from '../../src/scripts/version-record-policy';
import { mkVersionRegistryValidator } from '../../src/scripts/version-registry';
import { mkExecuteValidatorFromSP } from '../../src/scripts/execute-validator';
import { mkGovValidatorFromSP } from '../../src/scripts/gov-validator';
import { mkStabilityPoolValidatorFromSP } from '../../src/scripts/stability-pool-validator';

const indyTokenName = 'INDY';
const daoTokenName = 'DAO';
const govNftTokenName = 'GOV_NFT';
const pollManagerTokenName = 'POLL_MANAGER';
// const pollShardTokenName = 'POLL_SHARD';
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
// const totalIndyDistribution = 0n;
const treasuryIndyAmount = 0n;

const numCdpCreators = 2n;
const numCollectors = 2n;

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

const initialAssets: InitialAsset[] = [
  {
    name: 'iUSD',
    priceOracle: {
      tokenName: 'iUSD_ORACLE',
      startPrice: 1_000_000n,
      params: {
        biasTime: 120_000n,
        expirationTime: 900_000n,
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
    nextAsset: null,
  },
];

const alwaysFailValidatorHash =
  'ea84d625650d066e1645e3e81d9c70a73f9ed837bd96dc49850ae744';

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

async function initScriptRef(
  lucid: LucidEvolution,
  validator: SpendingValidator,
): Promise<Input> {
  const tx = lucid.newTx().pay.ToContract(
    credentialToAddress(lucid.config().network, {
      hash: alwaysFailValidatorHash,
      type: 'Script',
    }),
    null,
    undefined,
    validator,
  );

  const txHash = await tx
    .complete()
    .then((tx) => tx.sign.withWallet().complete())
    .then((tx) => tx.submit());

  await lucid.awaitTx(txHash);

  return {
    transactionId: txHash,
    index: 0,
  };
}

async function initCollector(
  lucid: LucidEvolution,
  collectorParams: CollectorParams,
): Promise<void> {
  const tx = lucid.newTx();

  for (let i = 0; i < Number(numCollectors); i++) {
    tx.pay.ToContract(CollectorContract.address(collectorParams, lucid), {
      kind: 'inline',
      value: Data.to(new Constr(0, [])),
    });
  }

  const txHash = await tx
    .complete()
    .then((tx) => tx.sign.withWallet().complete())
    .then((tx) => tx.submit());

  await lucid.awaitTx(txHash);
}

async function initCDPCreator(
  lucid: LucidEvolution,
  cdpCreatorParams: CDPCreatorParamsSP,
): Promise<void> {
  const tx = lucid.newTx();

  for (let i = 0; i < Number(numCdpCreators); i++) {
    tx.pay.ToContract(
      credentialToAddress(lucid.config().network, {
        hash: validatorToScriptHash(
          mkCDPCreatorValidatorFromSP(cdpCreatorParams),
        ),
        type: 'Script',
      }),
      { kind: 'inline', value: Data.to(new Constr(0, [])) },
      {
        [cdpCreatorParams.cdpCreatorNft[0].unCurrencySymbol +
        fromText(cdpCreatorParams.cdpCreatorNft[1].unTokenName)]: 1n,
      },
    );
  }

  const txHash = await tx
    .complete()
    .then((tx) => tx.sign.withWallet().complete())
    .then((tx) => tx.submit());

  await lucid.awaitTx(txHash);
}

async function initTreasury(
  lucid: LucidEvolution,
  treasuryParams: TreasuryParams,
  daoAsset: AssetClass,
  indyAsset: AssetClass,
  treasuryIndyAmount: bigint,
): Promise<void> {
  const tx = lucid.newTx().pay.ToContract(
    credentialToAddress(lucid.config().network, {
      hash: TreasuryContract.validatorHash(treasuryParams),
      type: 'Script',
    }),
    { kind: 'inline', value: Data.to(new Constr(0, [])) },
    {
      [daoAsset.currencySymbol + daoAsset.tokenName]: 1n,
      [indyAsset.currencySymbol + indyAsset.tokenName]: treasuryIndyAmount,
    },
  );

  const txHash = await tx
    .complete()
    .then((tx) => tx.sign.withWallet().complete())
    .then((tx) => tx.submit());

  await lucid.awaitTx(txHash);
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
        lovelace: 5_000_000n,
        [stakingParams.stakingManagerNFT[0].unCurrencySymbol +
        fromText(stakingParams.stakingManagerNFT[1].unTokenName)]: 1n,
      },
    )
    .complete()
    .then((tx) => tx.sign.withWallet().complete())
    .then((tx) => tx.submit());

  await lucid.awaitTx(txHash);
}

async function startPriceOracleTx(
  lucid: LucidEvolution,
  assetName: string,
  startPrice: bigint,
  oracleParams: PriceOracleParams,
  now: number = Date.now(),
): Promise<string> {
  const oraclePolicyId = await mintOneTimeToken(lucid, fromText(assetName), 1n);
  const oracleValidator = mkPriceOracleValidator(oracleParams);

  const oracleDatum: PriceOracleDatum = {
    price: {
      getOnChainInt: startPrice,
    },
    expiration: BigInt(now) + oracleParams.expiration,
  };

  const tx = lucid.newTx().pay.ToContract(
    validatorToAddress(lucid.config().network, oracleValidator),
    { kind: 'inline', value: serialisePriceOracleDatum(oracleDatum) },
    {
      lovelace: 5_000_000n,
      [oraclePolicyId + fromText(assetName)]: 1n,
    },
  );

  const txHash = await tx
    .complete()
    .then((tx) => tx.sign.withWallet().complete())
    .then((tx) => tx.submit());

  await lucid.awaitTx(txHash);

  return oraclePolicyId;
}

async function startInterestOracleTx(
  lucid: LucidEvolution,
  assetName: string,
  initialInterestRate: bigint,
  oracleParams: InterestOracleParams,
): Promise<string> {
  const oraclePolicyId = await mintOneTimeToken(lucid, fromText(assetName), 1n);
  const oracleValidator = mkInterestOracleValidator(oracleParams);

  const oracleDatum: InterestOracleDatum = {
    unitaryInterest: 0n,
    lastUpdated: 0n,
    interestRate: {
      getOnChainInt: initialInterestRate,
    },
  };

  const tx = lucid.newTx().pay.ToContract(
    validatorToAddress(lucid.config().network, oracleValidator),
    { kind: 'inline', value: serialiseInterestOracleDatum(oracleDatum) },
    {
      lovelace: 5_000_000n,
      [oraclePolicyId + fromText(assetName)]: 1n,
    },
  );

  const txHash = await tx
    .complete()
    .then((tx) => tx.sign.withWallet().complete())
    .then((tx) => tx.submit());

  await lucid.awaitTx(txHash);

  return oraclePolicyId;
}

async function initializeAsset(
  lucid: LucidEvolution,
  cdpParams: CdpParams,
  iassetToken: AssetClass,
  stabilityPoolParams: StabilityPoolParamsSP,
  stabilityPoolToken: AssetClass,
  asset: InitialAsset,
  now: number = Date.now(),
): Promise<void> {
  const [pkh, _] = await addrDetails(lucid);
  const priceOracleTokenName = asset.name + '_ORACLE';
  const priceOraclePolicyId = await startPriceOracleTx(
    lucid,
    priceOracleTokenName,
    asset.priceOracle.startPrice,
    {
      owner: pkh.hash,
      biasTime: asset.priceOracle.params.biasTime,
      expiration: asset.priceOracle.params.expirationTime,
    },
    now,
  );

  const interestOracleTokenName = asset.name + '_ORACLE';
  const interestOraclePolicyId = await startInterestOracleTx(
    lucid,
    interestOracleTokenName,
    asset.initerestOracle.initialInterestRate,
    {
      owner: pkh.hash,
      biasTime: asset.priceOracle.params.biasTime,
    },
  );

  const iassetDatum: IAssetContent = {
    assetName: fromText(asset.name),
    price: {
      Oracle: {
        oracleNft: {
          asset: {
            currencySymbol: priceOraclePolicyId,
            tokenName: fromText(priceOracleTokenName),
          },
        },
      },
    },
    interestOracleNft: {
      currencySymbol: interestOraclePolicyId,
      tokenName: fromText(interestOracleTokenName),
    },
    redemptionRatio: { getOnChainInt: asset.redemptionRatioPercentage },
    maintenanceRatio: { getOnChainInt: asset.maintenanceRatioPercentage },
    liquidationRatio: { getOnChainInt: asset.liquidationRatioPercentage },
    debtMintingFeePercentage: { getOnChainInt: asset.debtMintingFeePercentage },
    liquidationProcessingFeePercentage: {
      getOnChainInt: asset.liquidationProcessingFeePercentage,
    },
    stabilityPoolWithdrawalFeePercentage: {
      getOnChainInt: asset.stabilityPoolWithdrawalFeePercentage,
    },
    redemptionReimbursementPercentage: {
      getOnChainInt: asset.redemptionReimbursementPercentage,
    },
    redemptionProcessingFeePercentage: {
      getOnChainInt: asset.redemptionProcessingFeePercentage,
    },
    interestCollectorPortionPercentage: {
      getOnChainInt: asset.interestCollectorPortionPercentage,
    },
    firstIAsset: true,
    nextIAsset: asset.nextAsset ? fromText(asset.nextAsset) : null,
  };

  const assetTx = lucid
    .newTx()
    .pay.ToContract(
      CDPContract.address(cdpParams, lucid),
      { kind: 'inline', value: serialiseIAssetDatum(iassetDatum) },
      { [iassetToken.currencySymbol + iassetToken.tokenName]: 1n },
    );

  const assetTxHash = await assetTx
    .complete()
    .then((assetTx) => assetTx.sign.withWallet().complete())
    .then((assetTx) => assetTx.submit());

  await lucid.awaitTx(assetTxHash);

  const stabilityPoolDatum: StabilityPoolContent = {
    asset: fromText(asset.name),
    snapshot: {
      productVal: { value: 1n },
      depositVal: { value: 0n },
      sumVal: { value: 0n },
      epoch: 0n,
      scale: 0n,
    },
    epochToScaleToSum: new Map(),
  };

  const spTx = lucid.newTx().pay.ToContract(
    credentialToAddress(lucid.config().network, {
      hash: validatorToScriptHash(
        mkStabilityPoolValidatorFromSP(stabilityPoolParams),
      ),
      type: 'Script',
    }),
    {
      kind: 'inline',
      value: serialiseStabilityPoolDatum({
        StabilityPool: { content: stabilityPoolDatum },
      }),
    },
    {
      [stabilityPoolToken.currencySymbol + stabilityPoolToken.tokenName]: 1n,
    },
  );

  const spTxHash = await spTx
    .complete()
    .then((spTx) => spTx.sign.withWallet().complete())
    .then((spTx) => spTx.submit());

  await lucid.awaitTx(spTxHash);
}

async function initGovernance(
  lucid: LucidEvolution,
  governanceParams: GovParamsSP,
  govToken: AssetClass,
): Promise<void> {
  const datum: GovDatum = {
    currentProposal: 0n,
    currentVersion: 0n,
    protocolParams: {
      effectiveDelay: 1_000n,
      expirationPeriod: 180_000n,
      proposalDeposit: 0n,
      proposingPeriod: 8_000n,
      collateralFeePercentage: {
        getOnChainInt: 1_500_000n,
      },
      votingPeriod: 10_000n,
      totalShards: 4n,
      minimumQuorum: 100_000n,
      maxTreasuryLovelaceSpend: 10_000_000n,
      maxTreasuryIndySpend: 10_000_000n,
    },
    activeProposals: 0n,
    treasuryIndyWithdrawnAmt: 0n,
    iassetsCount: BigInt(initialAssets.length),
  };
  const tx = lucid.newTx().pay.ToContract(
    credentialToAddress(lucid.config().network, {
      hash: validatorToScriptHash(mkGovValidatorFromSP(governanceParams)),
      type: 'Script',
    }),
    { kind: 'inline', value: serialiseGovDatum(datum) },
    {
      [govToken.currencySymbol + govToken.tokenName]: 1n,
    },
  );

  const txHash = await tx
    .complete()
    .then((tx) => tx.sign.withWallet().complete())
    .then((tx) => tx.submit());

  await lucid.awaitTx(txHash);
}

async function mintAuthTokenDirect(
  lucid: LucidEvolution,
  asset: AssetClass,
  tokenName: string,
  amount: bigint,
): Promise<void> {
  const script = mkAuthTokenPolicy(asset, fromText(tokenName));
  const policyId = mintingPolicyToId(script);
  const address = await lucid.wallet().address();
  const utxos = await lucid.utxosAtWithUnit(
    address,
    asset.currencySymbol + asset.tokenName,
  );
  if (utxos.length === 0) {
    throw new Error('No utxos found');
  }

  const tx = lucid
    .newTx()
    .attach.MintingPolicy(script)
    .collectFrom(utxos)
    .mintAssets(
      {
        [policyId + fromText(tokenName)]: amount,
      },
      Data.to(new Constr(0, [])),
    );

  const txHash = await tx
    .complete()
    .then((tx) => tx.sign.withWallet().complete())
    .then((tx) => tx.submit());

  await lucid.awaitTx(txHash);
}

export async function init(
  lucid: LucidEvolution,
  now: number = Date.now(),
): Promise<SystemParams> {
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
    pollToken,
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

  const versionRecordTokenPolicy = mkVersionRecordTokenPolicy({
    upgradeToken: upgradeToken,
  });
  const versionRecordToken: AssetClass = {
    currencySymbol: mintingPolicyToId(versionRecordTokenPolicy),
    tokenName: fromText(versionRecordTokenName),
  };

  const versionRegistryValidator = mkVersionRegistryValidator();
  const versionRegistryValHash = validatorToScriptHash(
    versionRegistryValidator,
  );

  const cdpCreatorAsset: AssetClass = {
    currencySymbol: await mintOneTimeToken(
      lucid,
      fromText(cdpCreatorTokenName),
      numCdpCreators,
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
  const collectorValidator = CollectorContract.validator(collectorParams);
  const collectorValHash = CollectorContract.validatorHash(collectorParams);

  const stakingParams: StakingParams = {
    stakingManagerNFT: toSystemParamsAsset(stakingManagerAsset),
    stakingToken: toSystemParamsAsset(stakingToken),
    versionRecordToken: toSystemParamsAsset(versionRecordToken),
    pollToken: toSystemParamsAsset(pollToken),
    indyToken: toSystemParamsAsset(indyAsset),
    collectorValHash: collectorValHash,
  };
  const stakingValHash = StakingContract.validatorHash(stakingParams);

  await initStakingManager(lucid, stakingParams);

  const assetSymbolPolicy = mkIAssetTokenPolicy(cdpToken);
  const assetSymbol = mintingPolicyToId(assetSymbolPolicy);

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

  const stabilityPoolParams: StabilityPoolParamsSP = {
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
    accountCreateFeeLovelaces: 5_000_000n,
    accountAdjustmentFeeLovelaces: 5_000_000n,
    requestCollateralLovelaces: 5_000_000n,
  };
  const stabilityPoolValidator =
    mkStabilityPoolValidatorFromSP(stabilityPoolParams);
  const stabilityPoolValHash = validatorToScriptHash(stabilityPoolValidator);

  const treasuryParams: TreasuryParams = {
    upgradeToken: toSystemParamsAsset(upgradeToken),
    versionRecordToken: toSystemParamsAsset(versionRecordToken),
    treasuryUtxosStakeCredential: null,
  };

  const treasuryValidator = TreasuryContract.validator(treasuryParams);
  const treasuryValHash = TreasuryContract.validatorHash(treasuryParams);

  await initTreasury(
    lucid,
    treasuryParams,
    daoAsset,
    indyAsset,
    treasuryIndyAmount,
  );

  const cdpParams: CdpParams = {
    cdpAuthToken: toSystemParamsAsset(cdpToken),
    cdpAssetSymbol: { unCurrencySymbol: assetSymbol },
    iAssetAuthToken: toSystemParamsAsset(iassetToken),
    stabilityPoolAuthToken: toSystemParamsAsset(stabilityPoolToken),
    versionRecordToken: toSystemParamsAsset(versionRecordToken),
    upgradeToken: toSystemParamsAsset(upgradeToken),
    collectorValHash: collectorValHash,
    spValHash: stabilityPoolValHash,
    govNFT: toSystemParamsAsset(govNftAsset),
    minCollateralInLovelace: 10_000_000,
    partialRedemptionExtraFeeLovelace: 10_000_000,
    biasTime: 120_000,
    treasuryValHash: treasuryValHash,
  };
  const cdpValHash = CDPContract.validatorHash(cdpParams);

  const cdpCreatorParams: CDPCreatorParamsSP = {
    cdpCreatorNft: toSystemParamsAsset(cdpCreatorAsset),
    cdpAssetCs: { unCurrencySymbol: assetSymbol },
    cdpAuthTk: toSystemParamsAsset(cdpToken),
    iAssetAuthTk: toSystemParamsAsset(iassetToken),
    versionRecordToken: toSystemParamsAsset(versionRecordToken),
    cdpScriptHash: cdpValHash,
    collectorValHash: collectorValHash,
    minCollateralInLovelace: 10_000_000n,
    biasTime: 8_000n,
  };
  const cdpCreatorValidator = mkCDPCreatorValidatorFromSP(cdpCreatorParams);
  const cdpCreatorValHash = validatorToScriptHash(cdpCreatorValidator);

  await initCDPCreator(lucid, cdpCreatorParams);
  await initCollector(lucid, collectorParams);

  if (initialAssets.length > 0) {
    await mintAuthTokenDirect(lucid, govNftAsset, pollManagerTokenName, 1n);
    await mintAuthTokenDirect(lucid, pollToken, upgradeTokenName, 1n);

    for (const asset of initialAssets) {
      await mintAuthTokenDirect(lucid, upgradeToken, iassetTokenName, 1n);
      await mintAuthTokenDirect(
        lucid,
        upgradeToken,
        stabilityPoolTokenName,
        1n,
      );

      await initializeAsset(
        lucid,
        cdpParams,
        iassetToken,
        stabilityPoolParams,
        stabilityPoolToken,
        asset,
        now,
      );
    }

    await mintAuthTokenDirect(lucid, pollToken, upgradeTokenName, -1n);
    await mintAuthTokenDirect(lucid, govNftAsset, pollManagerTokenName, -1n);
  }

  const executeParams: ExecuteParamsSP = {
    govNFT: toSystemParamsAsset(govNftAsset),
    upgradeToken: toSystemParamsAsset(upgradeToken),
    iAssetToken: toSystemParamsAsset(iassetToken),
    stabilityPoolToken: toSystemParamsAsset(stabilityPoolToken),
    versionRecordToken: toSystemParamsAsset(versionRecordToken),
    cdpValHash: cdpValHash,
    sPoolValHash: stabilityPoolValHash,
    versionRegistryValHash: versionRegistryValHash,
    treasuryValHash: treasuryValHash,
    indyAsset: toSystemParamsAsset(indyAsset),
  };
  const executeValidator = mkExecuteValidatorFromSP(executeParams);
  const executeValHash = validatorToScriptHash(executeValidator);

  const pollShardParams: PollShardParamsSP = {
    pollToken: toSystemParamsAsset(pollToken),
    stakingToken: toSystemParamsAsset(stakingToken),
    indyAsset: toSystemParamsAsset(indyAsset),
    stakingValHash: stakingValHash,
  };
  const pollShardValidator = mkPollShardValidatorFromSP(pollShardParams);
  const pollShardValHash = validatorToScriptHash(pollShardValidator);

  const pollManagerParams: PollManagerParamsSP = {
    govNFT: toSystemParamsAsset(govNftAsset),
    pollToken: toSystemParamsAsset(pollToken),
    upgradeToken: toSystemParamsAsset(upgradeToken),
    indyAsset: toSystemParamsAsset(indyAsset),
    govExecuteValHash: executeValHash,
    pBiasTime: 120_000n,
    shardsValHash: pollShardValHash,
    treasuryValHash: treasuryValHash,
    initialIndyDistribution: 1_575_000_000_000n,
  };
  const pollManagerValidator = mkPollManagerValidatorFromSP(pollManagerParams);
  const pollManagerValHash = validatorToScriptHash(pollManagerValidator);

  const govParams: GovParamsSP = {
    gBiasTime: 120_000n,
    govNFT: toSystemParamsAsset(govNftAsset),
    pollToken: toSystemParamsAsset(pollToken),
    upgradeToken: toSystemParamsAsset(upgradeToken),
    indyAsset: toSystemParamsAsset(indyAsset),
    versionRecordToken: toSystemParamsAsset(versionRecordToken),
    pollManagerValHash: pollManagerValHash,
    daoIdentityToken: toSystemParamsAsset(daoAsset),
    iAssetAuthToken: toSystemParamsAsset(iassetToken),
  };
  const govValidator = mkGovValidatorFromSP(govParams);
  const govValHash = validatorToScriptHash(govValidator);

  await initGovernance(lucid, govParams, govNftAsset);

  return {
    cdpParams: cdpParams,
    cdpCreatorParams: cdpCreatorParams,
    collectorParams: collectorParams,
    executeParams: executeParams,
    govParams: govParams,
    stakingParams: stakingParams,
    stabilityPoolParams: stabilityPoolParams,
    treasuryParams: treasuryParams,
    scriptReferences: {
      cdpCreatorValidatorRef: {
        input: await initScriptRef(lucid, cdpCreatorValidator),
      },
      cdpValidatorRef: {
        input: await initScriptRef(lucid, CDPContract.validator(cdpParams)),
      },
      collectorValidatorRef: {
        input: await initScriptRef(lucid, collectorValidator),
      },
      executeValidatorRef: {
        input: await initScriptRef(lucid, executeValidator),
      },
      govValidatorRef: {
        input: await initScriptRef(lucid, govValidator),
      },
      pollShardValidatorRef: {
        input: await initScriptRef(lucid, pollShardValidator),
      },
      pollManagerValidatorRef: {
        input: await initScriptRef(lucid, pollManagerValidator),
      },
      iAssetTokenPolicyRef: {
        input: await initScriptRef(lucid, assetSymbolPolicy),
      },
      stakingValidatorRef: {
        input: await initScriptRef(
          lucid,
          StakingContract.validator(stakingParams),
        ),
      },
      stabilityPoolValidatorRef: {
        input: await initScriptRef(lucid, stabilityPoolValidator),
      },
      treasuryValidatorRef: {
        input: await initScriptRef(lucid, treasuryValidator),
      },
      authTokenPolicies: {
        cdpAuthTokenRef: {
          input: await initScriptRef(lucid, cdpTokenPolicy),
        },
        iAssetAuthTokenRef: {
          input: await initScriptRef(lucid, iassetTokenPolicy),
        },
        accountTokenRef: {
          input: await initScriptRef(lucid, accountTokenPolicy),
        },
        stabilityPoolAuthTokenRef: {
          input: await initScriptRef(lucid, stabilityPoolTokenPolicy),
        },
        pollManagerTokenRef: {
          input: await initScriptRef(lucid, pollTokenPolicy),
        },
        stakingTokenRef: {
          input: await initScriptRef(lucid, stakingTokenPolicy),
        },
        versionRecordTokenRef: {
          input: await initScriptRef(lucid, versionRecordTokenPolicy),
        },
      },
    },
    validatorHashes: {
      cdpCreatorHash: cdpCreatorValHash,
      cdpHash: cdpValHash,
      executeHash: executeValHash,
      govHash: govValHash,
      pollShardHash: pollShardValHash,
      pollManagerHash: pollManagerValHash,
      treasuryHash: treasuryValHash,
      stabilityPoolHash: stabilityPoolValHash,
      stakingHash: stakingValHash,
    },
  } as unknown as SystemParams;
}
