import {
    Constr,
    credentialToAddress,
  Data,
  fromText,
  LucidEvolution,
  mintingPolicyToId,
  PolicyId,
  SpendingValidator,
  toText,
  validatorToAddress,
} from '@lucid-evolution/lucid';
import {
  addrDetails,
  AssetClass,
  AssetClassSP,
  CDPContract,
  CDPCreatorContract,
  CdpCreatorParams,
  CdpParams,
  CollectorContract,
  CollectorParams,
  IAssetContent,
  Input,
  InterestOracleDatum,
  InterestOracleParams,
  mkInterestOracleValidator,
  PriceOracleDatum,
  PriceOracleParams,
  runOneShotMintTx,
  serialiseIAssetDatum,
  serialiseInterestOracleDatum,
  serialisePriceOracleDatum,
  StabilityPoolContract,
  StabilityPoolParams,
  StakingParams,
  SystemParams,
  TreasuryContract,
  TreasuryParams,
} from '../../src';
import { mkAuthTokenPolicy } from '../../src/scripts/auth-token-policy';
import { StakingContract } from '../../src/contracts/staking';
import { serialiseStakingDatum } from '../../src/types/indigo/staking';
import { mkIAssetTokenPolicy } from '../../src/scripts/iasset-policy';
import { runAndAwaitTx } from '../test-helpers';
import { mkPriceOracleValidator } from '../../src/scripts/price-oracle-validator';

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

const numCdpCreators = 10n;
const numCollectors = 10n;

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
            }
        },
        initerestOracle: {
            tokenName: 'iUSD_ORACLE',
            initialInterestRate: 1_000_000n,
            params: {
                biasTime: 120_000n,
            }
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
    }
];

const alwaysFailValidatorHash = 'ea84d625650d066e1645e3e81d9c70a73f9ed837bd96dc49850ae744';

export async function init(lucid: LucidEvolution, now: number = Date.now()): Promise<SystemParams> {
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

  // TODO: Create Version Record Token Policy
  const versionRecordToken: AssetClass = govNftAsset;

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
    treasuryValHash: collectorValHash,
  }
  const cdpValHash = CDPContract.validatorHash(cdpParams);

  const cdpCreatorParams: CdpCreatorParams = {
    cdpCreatorNft: toSystemParamsAsset(cdpCreatorAsset),
    cdpAssetCs: { unCurrencySymbol: assetSymbol },
    cdpAuthTk: toSystemParamsAsset(cdpToken),
    iAssetAuthTk: toSystemParamsAsset(iassetToken),
    versionRecordToken: toSystemParamsAsset(versionRecordToken),
    cdpScriptHash: cdpValHash,
    collectorValHash: collectorValHash,
    minCollateralInLovelace: 10_000_000,
    biasTime: 8_000,
  };
  const cdpCreatorValHash = CDPCreatorContract.validatorHash(cdpCreatorParams);

  await initCDPCreator(lucid, cdpCreatorParams);
  await initCollector(lucid, collectorParams);

  if (initialAssets.length > 0) {
    await mintAuthTokenDirect(lucid, govNftAsset, pollManagerTokenName, 1n);
    await mintAuthTokenDirect(lucid, pollToken, upgradeTokenName, 1n);

    for (const asset of initialAssets) {
        await mintAuthTokenDirect(lucid, upgradeToken, iassetTokenName, 1n);
        await mintAuthTokenDirect(lucid, upgradeToken, stabilityPoolTokenName, 1n);

        await initializeAsset(lucid, cdpParams, iassetToken, stabilityPoolParams, stabilityPoolToken, asset, now)
    }

    await mintAuthTokenDirect(lucid, pollToken, upgradeTokenName, -1n);
    await mintAuthTokenDirect(lucid, govNftAsset, pollManagerTokenName, -1n);
  }

  return {
    cdpParams: cdpParams,
    cdpCreatorParams: cdpCreatorParams,
    collectorParams: collectorParams,
    stakingParams: stakingParams,
    stabilityPoolParams: stabilityPoolParams,
    treasuryParams: treasuryParams,
    scriptReferences: {
        cdpCreatorValidatorRef: {
            input: await initScriptRef(lucid, CDPCreatorContract.validator(cdpCreatorParams))
        },
        cdpValidatorRef: {
            input: await initScriptRef(lucid, CDPContract.validator(cdpParams))
        },
        iAssetTokenPolicyRef: {
            input: await initScriptRef(lucid, assetSymbolPolicy)
        },
        stakingValidatorRef: {
            input: await initScriptRef(lucid, StakingContract.validator(stakingParams))
        },
        authTokenPolicies: {
            cdpAuthTokenRef: {
                input: await initScriptRef(lucid, cdpTokenPolicy)
            },
            iAssetAuthTokenRef: {
                input: await initScriptRef(lucid, iassetTokenPolicy)
            },
            stabilityPoolAuthTokenRef: {
                input: await initScriptRef(lucid, stabilityPoolTokenPolicy)
            },
            stakingTokenRef: {
                input: await initScriptRef(lucid, stakingTokenPolicy)
            }
        }
    },
    validatorHashes: {
        cdpCreatorHash: cdpCreatorValHash,
        cdpHash: cdpValHash,
        stabilityPoolHash: stabilityPoolValHash,
        stakingHash: StakingContract.validatorHash(stakingParams)
    }
  } as unknown as SystemParams;
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

async function initScriptRef(lucid: LucidEvolution, validator: SpendingValidator): Promise<Input> {
    const tx = await lucid.newTx().pay.ToContract(
        credentialToAddress(lucid.config().network, {hash: alwaysFailValidatorHash, type: 'Script'}),
        null,
        undefined,
        validator
    );

    const txHash = await tx.complete()
        .then((tx) => tx.sign.withWallet().complete())
        .then((tx) => tx.submit());

    await lucid.awaitTx(txHash);

    return {
        transactionId: txHash,
        index: 0
    };
}

async function initCollector(lucid: LucidEvolution, collectorParams: CollectorParams): Promise<void> {
    const tx = lucid.newTx();

    for (let i = 0; i < Number(numCollectors); i++) {
        tx.pay.ToContract(
            CollectorContract.address(collectorParams, lucid),
            { kind: 'inline', value: Data.to(new Constr(0, [])) },
        )
    }

    const txHash = await tx.complete()
        .then((tx) => tx.sign.withWallet().complete())
        .then((tx) => tx.submit());

    await lucid.awaitTx(txHash);
}

async function initCDPCreator(lucid: LucidEvolution, cdpCreatorParams: CdpCreatorParams): Promise<void> {
    const tx = lucid.newTx();

    for (let i = 0; i < Number(numCdpCreators); i++) {
        tx.pay.ToContract(
            CDPCreatorContract.address(cdpCreatorParams, lucid),
            { kind: 'inline', value: Data.to(new Constr(0, [])) },
            {
                [cdpCreatorParams.cdpCreatorNft[0].unCurrencySymbol + fromText(cdpCreatorParams.cdpCreatorNft[1].unTokenName)]: 1n
            }
        )
    }

    const txHash = await tx.complete()
        .then((tx) => tx.sign.withWallet().complete())
        .then((tx) => tx.submit());

    await lucid.awaitTx(txHash);
}

async function initTreasury(lucid: LucidEvolution, treasuryParams: TreasuryParams, daoAsset: AssetClass, indyAsset: AssetClass, treasuryIndyAmount: bigint): Promise<void> {
    const tx = lucid.newTx().pay.ToContract(
        credentialToAddress(lucid.config().network, {hash: TreasuryContract.validatorHash(treasuryParams), type: 'Script'}),
        { kind: 'inline', value: Data.to(new Constr(0, [])) },
        { 
            lovelace: 5_000_000n,
            [daoAsset.currencySymbol + daoAsset.tokenName]: 1n,
            [indyAsset.currencySymbol + indyAsset.tokenName]: treasuryIndyAmount,
        }
    );

    const txHash = await tx.complete()
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

async function startPriceOracleTx(lucid: LucidEvolution, assetName: string, startPrice: bigint, oracleParams: PriceOracleParams, now: number = Date.now()): Promise<string> {
    const oraclePolicyId = await mintOneTimeToken(lucid, fromText(assetName), 1n);
    const oracleValidator = mkPriceOracleValidator(oracleParams);

    const oracleDatum: PriceOracleDatum = {
        price: {
            getOnChainInt: startPrice,
        },
        expiration: BigInt(now) + oracleParams.expiration,
    }

    const tx = lucid.newTx()
        .pay.ToContract(
            validatorToAddress(lucid.config().network, oracleValidator),
            { kind: 'inline', value: serialisePriceOracleDatum(oracleDatum) },
            {
                lovelace: 5_000_000n,
                [oraclePolicyId + fromText(assetName)]: 1n,
            }
        )

    const txHash = await tx.complete()
        .then((tx) => tx.sign.withWallet().complete())
        .then((tx) => tx.submit());

    await lucid.awaitTx(txHash);

    return oraclePolicyId;
}


async function startInterestOracleTx(lucid: LucidEvolution, assetName: string, initialInterestRate: bigint, oracleParams: InterestOracleParams): Promise<string> {
    const oraclePolicyId = await mintOneTimeToken(lucid, fromText(assetName), 1n);
    const oracleValidator = mkInterestOracleValidator(oracleParams);


    const oracleDatum: InterestOracleDatum = {
        unitaryInterest: 0n,
        lastUpdated: 0n,
        interestRate: {
            getOnChainInt: initialInterestRate,
        }
    }

    const tx = lucid.newTx()
        .pay.ToContract(
            validatorToAddress(lucid.config().network, oracleValidator),
            { kind: 'inline', value: serialiseInterestOracleDatum(oracleDatum) },
            {
                lovelace: 5_000_000n,
                [oraclePolicyId + fromText(assetName)]: 1n,
            }
        )

    const txHash = await tx.complete()
        .then((tx) => tx.sign.withWallet().complete())
        .then((tx) => tx.submit());

    await lucid.awaitTx(txHash);

    return oraclePolicyId;
}

async function initializeAsset(lucid: LucidEvolution, cdpParams: CdpParams, iassetToken: AssetClass, stabilityPoolParams: StabilityPoolParams, stabilityPoolToken: AssetClass, asset: InitialAsset, now: number = Date.now()): Promise<void> {
    const [pkh, _] = await addrDetails(lucid);
    const priceOracleTokenName = asset.name + '_ORACLE';
    const priceOraclePolicyId = await startPriceOracleTx(lucid, priceOracleTokenName, asset.priceOracle.startPrice, {
        owner: pkh.hash,
        biasTime: asset.priceOracle.params.biasTime,
        expiration: asset.priceOracle.params.expirationTime,
    }, now);

    const interestOracleTokenName = asset.name + '_ORACLE';
    const interestOraclePolicyId = await startInterestOracleTx(lucid, interestOracleTokenName, asset.initerestOracle.initialInterestRate, {
        owner: pkh.hash,
        biasTime: asset.priceOracle.params.biasTime,
    });

    const iassetDatum: IAssetContent = {
        content: {
            assetName: fromText(asset.name),
            price: {
                Oracle: {
                    oracleNft: {
                        asset: {
                            currencySymbol: priceOraclePolicyId,
                            tokenName: fromText(priceOracleTokenName),
                        }
                    }
                }
            },
            interestOracleNft: {
                currencySymbol: interestOraclePolicyId,
                tokenName: fromText(interestOracleTokenName),
            },
            redemptionRatio: { getOnChainInt: asset.redemptionRatioPercentage },
            maintenanceRatio: { getOnChainInt: asset.maintenanceRatioPercentage },
            liquidationRatio: { getOnChainInt: asset.liquidationRatioPercentage },
            debtMintingFeePercentage: { getOnChainInt: asset.debtMintingFeePercentage },
            liquidationProcessingFeePercentage: { getOnChainInt: asset.liquidationProcessingFeePercentage },
            stabilityPoolWithdrawalFeePercentage: { getOnChainInt: asset.stabilityPoolWithdrawalFeePercentage },
            redemptionReimbursementPercentage: { getOnChainInt: asset.redemptionReimbursementPercentage },
            redemptionProcessingFeePercentage: { getOnChainInt: asset.redemptionProcessingFeePercentage },
            interestCollectorPortionPercentage: { getOnChainInt: asset.interestCollectorPortionPercentage },
            firstIAsset: true,
            nextIAsset: asset.nextAsset ? { Some: { value: asset.nextAsset } } : 'Nothing'
        }
    };

    const tx = lucid.newTx()
        .pay.ToContract(
            CDPContract.address(cdpParams, lucid),
            { kind: 'inline', value: serialiseIAssetDatum(iassetDatum)},
            { [iassetToken.currencySymbol + iassetToken.tokenName]: 1n }
        );

    const txHash = await tx.complete()
        .then((tx) => tx.sign.withWallet().complete())
        .then((tx) => tx.submit());

    await lucid.awaitTx(txHash);
}

async function mintAuthTokenDirect(lucid: LucidEvolution, asset: AssetClass, tokenName: string, amount: bigint): Promise<void> {
    const script = mkAuthTokenPolicy(asset, fromText(tokenName));
    const policyId = mintingPolicyToId(script);
    const address = await lucid.wallet().address();
    const utxos = await lucid.utxosAtWithUnit(address, asset.currencySymbol + asset.tokenName);
    if (utxos.length === 0) {
        throw new Error('No utxos found');
    }

    const tx = lucid.newTx()
        .attach.MintingPolicy(script)
        .collectFrom(utxos)
        .mintAssets(
            {
                [policyId + fromText(tokenName)]: amount
            },
            Data.to(new Constr(0, []))
        );

    const txHash = await tx.complete()
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
