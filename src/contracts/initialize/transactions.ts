import {
  Constr,
  credentialToAddress,
  Data,
  fromHex,
  fromText,
  LucidEvolution,
  mintingPolicyToId,
  PolicyId,
  SpendingValidator,
  validatorToScriptHash,
} from '@lucid-evolution/lucid';
import { AssetClass } from '../../types/generic';
import {
  CDPCreatorParamsSP,
  CdpParamsSP,
  CollectorParamsSP,
  ExecuteParamsSP,
  GovParamsSP,
  Input,
  LrpParamsSP,
  PollManagerParamsSP,
  PollShardParamsSP,
  StabilityPoolParamsSP,
  StakingParamsSP,
  SystemParams,
  toSystemParamsAsset,
  TreasuryParamsSP,
  VersionRecordParams,
} from '../../types/system-params';
import { addrDetails, createScriptAddress } from '../../utils/lucid-utils';
import { runOneShotMintTx } from '../one-shot/transactions';
import { startInterestOracle } from '../interest-oracle/transactions';
import { startPriceOracleTx } from '../price-oracle/transactions';
import { PriceOracleParams } from '../price-oracle/types';
import { mkAuthTokenPolicy } from '../../scripts/auth-token-policy';
import { mkIAssetTokenPolicy } from '../../scripts/iasset-policy';
import {
  mkVersionRecordTokenPolicy,
  mkVersionRegistryValidator,
} from '../version-registry/scripts';
import { mkGovValidatorFromSP } from '../gov/scripts';
import { mkStabilityPoolValidatorFromSP } from '../stability-pool/scripts';
import { mkStakingValidatorFromSP } from '../staking/scripts';
import { serialiseStakingDatum } from '../staking/types-new';
import {
  initEpochToScaleToSumMap,
  initSpSnapshot,
} from '../stability-pool/helpers';
import {
  serialiseStabilityPoolDatum,
  StabilityPoolContent,
} from '../stability-pool/types-new';
import { mkCdpValidatorFromSP } from '../cdp/scripts';
import { IAssetContent, serialiseIAssetDatum } from '../cdp/types';
import { GovDatum, serialiseGovDatum } from '../gov/types';
import { mkCollectorValidatorFromSP } from '../collector/scripts';
import { mkCDPCreatorValidatorFromSP } from '../cdp-creator/scripts';
import { mkExecuteValidatorFromSP } from '../execute/scripts';
import { mkLrpValidatorFromSP } from '../lrp/scripts';
import {
  mkPollManagerValidatorFromSP,
  mkPollShardValidatorFromSP,
} from '../poll/scripts';
import { mkTreasuryValidatorFromSP } from '../treasury/scripts';
import { InitialAsset, AssetInfo } from './types';

export type { AssetInfo, InitialAsset } from './types';
import {
  ACCOUNT_TOKEN_NAME,
  ALWAYS_FAIL_VALIDATOR_HASH,
  CDP_CREATOR_TOKEN_NAME,
  CDP_TOKEN_NAME,
  GOV_NFT_TOKEN_NAME,
  IASSET_TOKEN_NAME,
  INDY_TOKEN_NAME,
  DAO_TOKEN_NAME,
  NUM_CDP_CREATORS,
  NUM_COLLECTORS,
  POLL_MANAGER_TOKEN_NAME,
  STABILITY_POOL_TOKEN_NAME,
  STAKING_MANAGER_TOKEN_NAME,
  STAKING_TOKEN_NAME,
  SNAPSHOT_EPOCH_TO_SCALE_TO_SUM_TOKEN_NAME,
  submitAndAwaitTx,
  TOTAL_INDY_SUPPLY,
  TREASURY_INDY_AMOUNT,
  UPGRADE_TOKEN_NAME,
  VERSION_RECORD_TOKEN_NAME,
} from './helpers';

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
    credentialToAddress(lucid.config().network!, {
      hash: ALWAYS_FAIL_VALIDATOR_HASH,
      type: 'Script',
    }),
    undefined,
    undefined,
    validator,
  );

  const txHash = await submitAndAwaitTx(lucid, tx);
  return { transactionId: txHash, index: 0 };
}

async function initCollector(
  lucid: LucidEvolution,
  collectorParams: CollectorParamsSP,
): Promise<void> {
  const tx = lucid.newTx();

  for (let i = 0; i < Number(NUM_COLLECTORS); i++) {
    tx.pay.ToContract(
      createScriptAddress(
        lucid.config().network!,
        validatorToScriptHash(mkCollectorValidatorFromSP(collectorParams)),
      ),
      {
        kind: 'inline',
        value: Data.to(new Constr(0, [])),
      },
    );
  }

  await submitAndAwaitTx(lucid, tx);
}

async function initCDPCreator(
  lucid: LucidEvolution,
  cdpCreatorParams: CDPCreatorParamsSP,
): Promise<void> {
  const tx = lucid.newTx();

  for (let i = 0; i < Number(NUM_CDP_CREATORS); i++) {
    tx.pay.ToContract(
      credentialToAddress(lucid.config().network!, {
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

  await submitAndAwaitTx(lucid, tx);
}

async function initTreasury(
  lucid: LucidEvolution,
  treasuryParams: TreasuryParamsSP,
  daoAsset: AssetClass,
  indyAsset: AssetClass,
  treasuryIndyAmount: bigint,
): Promise<void> {
  const tx = lucid.newTx().pay.ToContract(
    credentialToAddress(lucid.config().network!, {
      hash: validatorToScriptHash(mkTreasuryValidatorFromSP(treasuryParams)),
      type: 'Script',
    }),
    { kind: 'inline', value: Data.to(new Constr(0, [])) },
    {
      [daoAsset.currencySymbol + daoAsset.tokenName]: 1n,
      [indyAsset.currencySymbol + indyAsset.tokenName]: treasuryIndyAmount,
    },
  );

  await submitAndAwaitTx(lucid, tx);
}

async function initStakingManager(
  lucid: LucidEvolution,
  stakingParams: StakingParamsSP,
): Promise<void> {
  const tx = lucid.newTx().pay.ToContract(
    createScriptAddress(
      lucid.config().network!,
      validatorToScriptHash(mkStakingValidatorFromSP(stakingParams)),
    ),
    {
      kind: 'inline',
      value: serialiseStakingDatum({
        totalStake: 0n,
        managerSnapshot: { snapshotAda: 0n },
      }),
    },
    {
      lovelace: 5_000_000n,
      [stakingParams.stakingManagerNFT[0].unCurrencySymbol +
      fromText(stakingParams.stakingManagerNFT[1].unTokenName)]: 1n,
    },
  );

  await submitAndAwaitTx(lucid, tx);
}

async function initializeAsset(
  lucid: LucidEvolution,
  cdpParams: CdpParamsSP,
  iassetToken: AssetClass,
  stabilityPoolParams: StabilityPoolParamsSP,
  stabilityPoolToken: AssetClass,
  asset: InitialAsset,
  now: number = Date.now(),
): Promise<AssetInfo> {
  const [pkh] = await addrDetails(lucid);
  const priceOracleParams: PriceOracleParams = {
    owner: pkh.hash,
    biasTime: asset.priceOracle.params.biasTime,
    expiration: asset.priceOracle.params.expirationTime,
  };

  const [priceOracleStartTx, priceOracleNft] = await startPriceOracleTx(
    lucid,
    asset.name + '_ORACLE',
    {
      getOnChainInt: asset.priceOracle.startPrice,
    },
    priceOracleParams,
    now,
  );
  await submitAndAwaitTx(lucid, priceOracleStartTx);

  const interestOracleTokenName = asset.name + '_ORACLE';
  const [startInterestOracleTx, interestOracleNft] = await startInterestOracle(
    0n,
    asset.interestOracle.initialInterestRate,
    0n,
    {
      owner: pkh.hash,
      biasTime: asset.priceOracle.params.biasTime,
    },
    lucid,
    interestOracleTokenName,
  );
  await submitAndAwaitTx(lucid, startInterestOracleTx);

  const iassetDatum: IAssetContent = {
    assetName: fromText(asset.name),
    price: {
      Oracle: {
        content: priceOracleNft,
      },
    },
    interestOracleNft: interestOracleNft,
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
      createScriptAddress(
        lucid.config().network!,
        validatorToScriptHash(mkCdpValidatorFromSP(cdpParams)),
      ),
      { kind: 'inline', value: serialiseIAssetDatum(iassetDatum) },
      { [iassetToken.currencySymbol + iassetToken.tokenName]: 1n },
    );

  await submitAndAwaitTx(lucid, assetTx);

  const stabilityPoolDatum: StabilityPoolContent = {
    asset: fromHex(fromText(asset.name)),
    poolSnapshot: initSpSnapshot,
    epochToScaleToSum: initEpochToScaleToSumMap(),
  };

  const spTx = lucid.newTx().pay.ToContract(
    credentialToAddress(lucid.config().network!, {
      hash: validatorToScriptHash(
        mkStabilityPoolValidatorFromSP(stabilityPoolParams),
      ),
      type: 'Script',
    }),
    {
      kind: 'inline',
      value: serialiseStabilityPoolDatum({ StabilityPool: stabilityPoolDatum }),
    },
    {
      [stabilityPoolToken.currencySymbol + stabilityPoolToken.tokenName]: 1n,
    },
  );

  await submitAndAwaitTx(lucid, spTx);

  return { iassetTokenNameAscii: asset.name, oracleParams: priceOracleParams };
}

async function initGovernance(
  lucid: LucidEvolution,
  governanceParams: GovParamsSP,
  govToken: AssetClass,
  initialAssets: InitialAsset[],
): Promise<void> {
  const datum: GovDatum = {
    currentProposal: 0n,
    currentVersion: 0n,
    protocolParams: {
      effectiveDelay: 1_000n,
      expirationPeriod: 180_000n,
      proposalDeposit: 1_000n,
      proposingPeriod: 100_000n,
      collateralFeePercentage: {
        getOnChainInt: 1_500_000n,
      },
      votingPeriod: 1000_000n,
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
    credentialToAddress(lucid.config().network!, {
      hash: validatorToScriptHash(mkGovValidatorFromSP(governanceParams)),
      type: 'Script',
    }),
    { kind: 'inline', value: serialiseGovDatum(datum) },
    {
      [govToken.currencySymbol + govToken.tokenName]: 1n,
    },
  );

  await submitAndAwaitTx(lucid, tx);
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

  await submitAndAwaitTx(lucid, tx);
}

export async function init(
  lucid: LucidEvolution,
  initialAssets: InitialAsset[],
  now: number = Date.now(),
): Promise<[SystemParams, AssetInfo[]]> {
  const indyAsset: AssetClass = {
    currencySymbol: await mintOneTimeToken(
      lucid,
      fromText(INDY_TOKEN_NAME),
      TOTAL_INDY_SUPPLY,
    ),
    tokenName: fromText(INDY_TOKEN_NAME),
  };

  const daoAsset: AssetClass = {
    currencySymbol: await mintOneTimeToken(lucid, fromText(DAO_TOKEN_NAME), 1n),
    tokenName: fromText(DAO_TOKEN_NAME),
  };

  const govNftAsset: AssetClass = {
    currencySymbol: await mintOneTimeToken(
      lucid,
      fromText(GOV_NFT_TOKEN_NAME),
      1n,
    ),
    tokenName: fromText(GOV_NFT_TOKEN_NAME),
  };

  const pollTokenPolicy = mkAuthTokenPolicy(
    govNftAsset,
    fromText(POLL_MANAGER_TOKEN_NAME),
  );
  const pollToken: AssetClass = {
    currencySymbol: mintingPolicyToId(pollTokenPolicy),
    tokenName: fromText(POLL_MANAGER_TOKEN_NAME),
  };

  const upgradeTokenPolicy = mkAuthTokenPolicy(
    pollToken,
    fromText(UPGRADE_TOKEN_NAME),
  );
  const upgradeToken: AssetClass = {
    currencySymbol: mintingPolicyToId(upgradeTokenPolicy),
    tokenName: fromText(UPGRADE_TOKEN_NAME),
  };

  const iassetTokenPolicy = mkAuthTokenPolicy(
    upgradeToken,
    fromText(IASSET_TOKEN_NAME),
  );
  const iassetToken: AssetClass = {
    currencySymbol: mintingPolicyToId(iassetTokenPolicy),
    tokenName: fromText(IASSET_TOKEN_NAME),
  };

  const stabilityPoolTokenPolicy = mkAuthTokenPolicy(
    upgradeToken,
    fromText(STABILITY_POOL_TOKEN_NAME),
  );
  const stabilityPoolToken: AssetClass = {
    currencySymbol: mintingPolicyToId(stabilityPoolTokenPolicy),
    tokenName: fromText(STABILITY_POOL_TOKEN_NAME),
  };
  const versionRecordParams: VersionRecordParams = {
    upgradeToken: toSystemParamsAsset(upgradeToken),
  };
  const versionRecordTokenPolicy = mkVersionRecordTokenPolicy({
    upgradeToken,
  });
  const versionRecordToken: AssetClass = {
    currencySymbol: mintingPolicyToId(versionRecordTokenPolicy),
    tokenName: fromText(VERSION_RECORD_TOKEN_NAME),
  };

  const versionRegistryValidator = mkVersionRegistryValidator();
  const versionRegistryValHash = validatorToScriptHash(
    versionRegistryValidator,
  );

  const cdpCreatorAsset: AssetClass = {
    currencySymbol: await mintOneTimeToken(
      lucid,
      fromText(CDP_CREATOR_TOKEN_NAME),
      NUM_CDP_CREATORS,
    ),
    tokenName: fromText(CDP_CREATOR_TOKEN_NAME),
  };

  const cdpTokenPolicy = mkAuthTokenPolicy(
    cdpCreatorAsset,
    fromText(CDP_TOKEN_NAME),
  );
  const cdpToken: AssetClass = {
    currencySymbol: mintingPolicyToId(cdpTokenPolicy),
    tokenName: fromText(CDP_TOKEN_NAME),
  };

  const stakingManagerAsset: AssetClass = {
    currencySymbol: await mintOneTimeToken(
      lucid,
      fromText(STAKING_MANAGER_TOKEN_NAME),
      1n,
    ),
    tokenName: fromText(STAKING_MANAGER_TOKEN_NAME),
  };

  const stakingTokenPolicy = mkAuthTokenPolicy(
    stakingManagerAsset,
    fromText(STAKING_TOKEN_NAME),
  );
  const stakingToken: AssetClass = {
    currencySymbol: mintingPolicyToId(stakingTokenPolicy),
    tokenName: fromText(STAKING_TOKEN_NAME),
  };

  const collectorParams: CollectorParamsSP = {
    stakingManagerNFT: toSystemParamsAsset(stakingManagerAsset),
    stakingToken: toSystemParamsAsset(stakingToken),
    versionRecordToken: toSystemParamsAsset(versionRecordToken),
  };
  const collectorValidator = mkCollectorValidatorFromSP(collectorParams);
  const collectorValHash = validatorToScriptHash(collectorValidator);

  const stakingParams: StakingParamsSP = {
    stakingManagerNFT: toSystemParamsAsset(stakingManagerAsset),
    stakingToken: toSystemParamsAsset(stakingToken),
    versionRecordToken: toSystemParamsAsset(versionRecordToken),
    pollToken: toSystemParamsAsset(pollToken),
    indyToken: toSystemParamsAsset(indyAsset),
    collectorValHash: collectorValHash,
  };
  const stakingValHash = validatorToScriptHash(
    mkStakingValidatorFromSP(stakingParams),
  );

  await initStakingManager(lucid, stakingParams);

  const assetSymbolPolicy = mkIAssetTokenPolicy(cdpToken);
  const assetSymbol = mintingPolicyToId(assetSymbolPolicy);

  const snapshotEpochToScaleToSumTokenPolicy = mkAuthTokenPolicy(
    stabilityPoolToken,
    fromText(SNAPSHOT_EPOCH_TO_SCALE_TO_SUM_TOKEN_NAME),
  );
  const snapshotEpochToScaleToSumToken: AssetClass = {
    currencySymbol: mintingPolicyToId(snapshotEpochToScaleToSumTokenPolicy),
    tokenName: fromText(SNAPSHOT_EPOCH_TO_SCALE_TO_SUM_TOKEN_NAME),
  };

  const accountTokenPolicy = mkAuthTokenPolicy(
    stabilityPoolToken,
    fromText(ACCOUNT_TOKEN_NAME),
  );
  const accountToken: AssetClass = {
    currencySymbol: mintingPolicyToId(accountTokenPolicy),
    tokenName: fromText(ACCOUNT_TOKEN_NAME),
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
    accountCreateFeeLovelaces: 5_000_000,
    accountAdjustmentFeeLovelaces: 5_000_000,
    requestCollateralLovelaces: 5_000_000,
  };
  const stabilityPoolValidator =
    mkStabilityPoolValidatorFromSP(stabilityPoolParams);
  const stabilityPoolValHash = validatorToScriptHash(stabilityPoolValidator);

  const treasuryParams: TreasuryParamsSP = {
    upgradeToken: toSystemParamsAsset(upgradeToken),
    versionRecordToken: toSystemParamsAsset(versionRecordToken),
    treasuryUtxosStakeCredential: undefined,
  };

  const treasuryValidator = mkTreasuryValidatorFromSP(treasuryParams);
  const treasuryValHash = validatorToScriptHash(treasuryValidator);

  await initTreasury(
    lucid,
    treasuryParams,
    daoAsset,
    indyAsset,
    TREASURY_INDY_AMOUNT,
  );

  const cdpParams: CdpParamsSP = {
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
    biasTime: 180_000,
    treasuryValHash: treasuryValHash,
  };
  const cdpValHash = validatorToScriptHash(mkCdpValidatorFromSP(cdpParams));

  const cdpCreatorParams: CDPCreatorParamsSP = {
    cdpCreatorNft: toSystemParamsAsset(cdpCreatorAsset),
    cdpAssetCs: { unCurrencySymbol: assetSymbol },
    cdpAuthTk: toSystemParamsAsset(cdpToken),
    iAssetAuthTk: toSystemParamsAsset(iassetToken),
    versionRecordToken: toSystemParamsAsset(versionRecordToken),
    cdpScriptHash: cdpValHash,
    collectorValHash: collectorValHash,
    minCollateralInLovelace: 10_000_000,
    biasTime: 180_000n,
  };
  const cdpCreatorValidator = mkCDPCreatorValidatorFromSP(cdpCreatorParams);
  const cdpCreatorValHash = validatorToScriptHash(cdpCreatorValidator);

  await initCDPCreator(lucid, cdpCreatorParams);
  await initCollector(lucid, collectorParams);

  const assetInfos: AssetInfo[] = [];
  if (initialAssets.length > 0) {
    await mintAuthTokenDirect(lucid, govNftAsset, POLL_MANAGER_TOKEN_NAME, 1n);
    await mintAuthTokenDirect(lucid, pollToken, UPGRADE_TOKEN_NAME, 1n);

    for (const asset of initialAssets) {
      await mintAuthTokenDirect(lucid, upgradeToken, IASSET_TOKEN_NAME, 1n);
      await mintAuthTokenDirect(
        lucid,
        upgradeToken,
        STABILITY_POOL_TOKEN_NAME,
        1n,
      );

      const assetInfo = await initializeAsset(
        lucid,
        cdpParams,
        iassetToken,
        stabilityPoolParams,
        stabilityPoolToken,
        asset,
        now,
      );

      assetInfos.push(assetInfo);
    }

    await mintAuthTokenDirect(lucid, pollToken, UPGRADE_TOKEN_NAME, -1n);
    await mintAuthTokenDirect(lucid, govNftAsset, POLL_MANAGER_TOKEN_NAME, -1n);
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

  await initGovernance(lucid, govParams, govNftAsset, initialAssets);

  const lrpParams: LrpParamsSP = {
    iassetNft: cdpParams.iAssetAuthToken,
    iassetPolicyId: cdpParams.cdpAssetSymbol,
    minRedemptionLovelacesAmt: 10_000_000n,
    versionRecordToken: cdpParams.versionRecordToken,
  };

  const lrpValidator = mkLrpValidatorFromSP(lrpParams);
  const lrpValHash = validatorToScriptHash(lrpValidator);

  // Script ref txs must run sequentially: each spends wallet UTxOs, so the next
  // must wait for the previous to confirm and update the wallet's UTxO set.
  const scriptRefCalls = [
    () => initScriptRef(lucid, lrpValidator),
    () => initScriptRef(lucid, cdpCreatorValidator),
    () => initScriptRef(lucid, mkCdpValidatorFromSP(cdpParams)),
    () => initScriptRef(lucid, collectorValidator),
    () => initScriptRef(lucid, executeValidator),
    () => initScriptRef(lucid, govValidator),
    () => initScriptRef(lucid, pollShardValidator),
    () => initScriptRef(lucid, pollManagerValidator),
    () =>
      initScriptRef(lucid, assetSymbolPolicy as unknown as SpendingValidator),
    () => initScriptRef(lucid, mkStakingValidatorFromSP(stakingParams)),
    () => initScriptRef(lucid, stabilityPoolValidator),
    () => initScriptRef(lucid, treasuryValidator),
    () => initScriptRef(lucid, govValidator),
    () => initScriptRef(lucid, versionRegistryValidator),
    () =>
      initScriptRef(
        lucid,
        versionRecordTokenPolicy as unknown as SpendingValidator,
      ),
    () => initScriptRef(lucid, cdpTokenPolicy as unknown as SpendingValidator),
    () =>
      initScriptRef(lucid, iassetTokenPolicy as unknown as SpendingValidator),
    () =>
      initScriptRef(lucid, accountTokenPolicy as unknown as SpendingValidator),
    () =>
      initScriptRef(
        lucid,
        stabilityPoolTokenPolicy as unknown as SpendingValidator,
      ),
    () => initScriptRef(lucid, pollTokenPolicy as unknown as SpendingValidator),
    () =>
      initScriptRef(lucid, stakingTokenPolicy as unknown as SpendingValidator),
    () =>
      initScriptRef(
        lucid,
        versionRecordTokenPolicy as unknown as SpendingValidator,
      ),
    () =>
      initScriptRef(lucid, assetSymbolPolicy as unknown as SpendingValidator),
    () =>
      initScriptRef(lucid, upgradeTokenPolicy as unknown as SpendingValidator),
    () =>
      initScriptRef(
        lucid,
        stabilityPoolTokenPolicy as unknown as SpendingValidator,
      ),
    () =>
      initScriptRef(
        lucid,
        snapshotEpochToScaleToSumTokenPolicy as unknown as SpendingValidator,
      ),
  ];
  const scriptRefInputs: Input[] = [];
  for (const fn of scriptRefCalls) {
    scriptRefInputs.push(await fn());
  }

  const [
    lrpValidatorRef,
    cdpCreatorValidatorRef,
    cdpValidatorRef,
    collectorValidatorRef,
    executeValidatorRef,
    govValidatorRef,
    pollShardValidatorRef,
    pollManagerValidatorRef,
    iAssetTokenPolicyRef,
    stakingValidatorRef,
    stabilityPoolValidatorRef,
    treasuryValidatorRef,
    governanceValidatorRef,
    versionRegistryValidatorRef,
    versionRecordTokenPolicyRef,
    cdpAuthTokenRef,
    iAssetAuthTokenRef,
    accountTokenRef,
    stabilityPoolAuthTokenRef,
    pollManagerTokenRef,
    stakingTokenRef,
    versionRecordTokenRef,
    iAssetTokenRef,
    upgradeTokenRef,
    stabilityPoolTokenRef,
    snapshotEpochToScaleToSumTokenRef,
  ] = scriptRefInputs;

  return [
    {
      cdpParams: cdpParams,
      cdpCreatorParams: cdpCreatorParams,
      collectorParams: collectorParams,
      executeParams: executeParams,
      govParams: govParams,
      stakingParams: stakingParams,
      stabilityPoolParams: stabilityPoolParams,
      treasuryParams: treasuryParams,
      pollShardParams: pollShardParams,
      pollManagerParams: pollManagerParams,
      indyToken: toSystemParamsAsset(indyAsset),
      distributionParams: {
        treasuryIndyAmount: 1_575_000_000_000,
        totalINDYSupply: 35_000_000_000_000,
        initialIndyDistribution: 1_575_000_000_000,
      },
      lrpParams: lrpParams,
      versionRecordParams: versionRecordParams,
      startTime: {
        slot: 0,
        blockHeader: '',
      },
      scriptReferences: {
        lrpValidatorRef: { input: lrpValidatorRef },
        cdpCreatorValidatorRef: { input: cdpCreatorValidatorRef },
        cdpValidatorRef: { input: cdpValidatorRef },
        collectorValidatorRef: { input: collectorValidatorRef },
        executeValidatorRef: { input: executeValidatorRef },
        govValidatorRef: { input: govValidatorRef },
        pollShardValidatorRef: { input: pollShardValidatorRef },
        pollManagerValidatorRef: { input: pollManagerValidatorRef },
        iAssetTokenPolicyRef: { input: iAssetTokenPolicyRef },
        stakingValidatorRef: { input: stakingValidatorRef },
        stabilityPoolValidatorRef: { input: stabilityPoolValidatorRef },
        treasuryValidatorRef: { input: treasuryValidatorRef },
        governanceValidatorRef: { input: governanceValidatorRef },
        versionRegistryValidatorRef: { input: versionRegistryValidatorRef },
        versionRecordTokenPolicyRef: { input: versionRecordTokenPolicyRef },
        authTokenPolicies: {
          cdpAuthTokenRef: { input: cdpAuthTokenRef },
          iAssetAuthTokenRef: { input: iAssetAuthTokenRef },
          accountTokenRef: { input: accountTokenRef },
          stabilityPoolAuthTokenRef: { input: stabilityPoolAuthTokenRef },
          pollManagerTokenRef: { input: pollManagerTokenRef },
          stakingTokenRef: { input: stakingTokenRef },
          versionRecordTokenRef: { input: versionRecordTokenRef },
          iAssetTokenRef: { input: iAssetTokenRef },
          upgradeTokenRef: { input: upgradeTokenRef },
          stabilityPoolTokenRef: { input: stabilityPoolTokenRef },
          snapshotEpochToScaleToSumTokenRef: {
            input: snapshotEpochToScaleToSumTokenRef,
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
        collectorHash: collectorValHash,
        versionRegistryHash: versionRegistryValHash,
        lrpHash: lrpValHash,
      },
    } as SystemParams,
    assetInfos,
  ];
}
