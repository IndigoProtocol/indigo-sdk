import {
  addAssets,
  Assets,
  Data,
  LucidEvolution,
  OutRef,
  slotToUnixTime,
  TxBuilder,
  UTxO,
} from '@lucid-evolution/lucid';
import {
  fromSystemParamsAsset,
  fromSystemParamsScriptRef,
  SystemParams,
} from '../../types/system-params';
import { TreasuryContract } from '../treasury/transactions';
import {
  addrDetails,
  createScriptAddress,
  getInlineDatumOrThrow,
} from '../../utils/lucid-utils';
import { matchSingle } from '../../utils/utils';
import {
  CDPContent,
  parseCdpDatumOrThrow,
  parseIAssetDatumOrThrow,
  serialiseCdpDatum,
  serialiseCdpRedeemer,
} from './types';
import { parsePriceOracleDatum } from '../price-oracle/types';
import { parseInterestOracleDatum } from '../interest-oracle/types';
import { parseGovDatumOrThrow } from '../gov/types';
import {
  calculateAccruedInterest,
  calculateUnitaryInterestSinceOracleLastUpdated,
  computeInterestLovelacesFor100PercentCR,
} from '../interest-oracle/helpers';
import { oracleExpirationAwareValidity } from '../price-oracle/helpers';
import { match, P } from 'ts-pattern';
import { serialiseCDPCreatorRedeemer } from '../cdp-creator/types';
import {
  assetClassValueOf,
  lovelacesAmt,
  mkAssetsOf,
  mkLovelacesOf,
} from '../../utils/value-helpers';
import { calculateMinCollateralCappedIAssetRedemptionAmt } from './helpers';
import { bigintMin } from '../../utils/bigint-utils';
import { ocdMul } from '../../types/on-chain-decimal';
import {
  parseStabilityPoolDatum,
  serialiseStabilityPoolDatum,
  serialiseStabilityPoolRedeemer,
} from '../stability-pool/types-new';
import { liquidationHelper } from '../stability-pool/helpers';
import { array as A, function as F } from 'fp-ts';
import { calculateFeeFromPercentage } from '../../utils/indigo-helpers';
import { collectorFeeTx } from '../collector/transactions';

export async function openCdp(
  collateralAmount: bigint,
  mintedAmount: bigint,
  sysParams: SystemParams,
  cdpCreatorOref: OutRef,
  iassetOref: OutRef,
  priceOracleOref: OutRef,
  interestOracleOref: OutRef,
  collectorOref: OutRef,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  const network = lucid.config().network!;
  const currentTime = BigInt(slotToUnixTime(network, currentSlot));

  const [pkh, skh] = await addrDetails(lucid);

  const cdpCreatorRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.cdpCreatorValidatorRef,
      ),
    ]),
    (_) => new Error('Expected a single cdp creator Ref Script UTXO'),
  );
  const cdpAuthTokenPolicyRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.authTokenPolicies.cdpAuthTokenRef,
      ),
    ]),
    (_) => new Error('Expected a single cdp auth token policy Ref Script UTXO'),
  );
  const iAssetTokenPolicyRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.iAssetTokenPolicyRef,
      ),
    ]),
    (_) => new Error('Expected a single iasset token policy Ref Script UTXO'),
  );

  const iassetUtxo = matchSingle(
    await lucid.utxosByOutRef([iassetOref]),
    (_) => new Error('Expected a single iasset UTXO'),
  );
  const iassetDatum = parseIAssetDatumOrThrow(
    getInlineDatumOrThrow(iassetUtxo),
  );

  const priceOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([priceOracleOref]),
    (_) => new Error('Expected a single price oracle UTXO'),
  );
  const priceOracleDatum = parsePriceOracleDatum(
    getInlineDatumOrThrow(priceOracleUtxo),
  );

  const interestOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([interestOracleOref]),
    (_) => new Error('Expected a single interest oracle UTXO'),
  );
  const interestOracleDatum = parseInterestOracleDatum(
    getInlineDatumOrThrow(interestOracleUtxo),
  );

  const cdpCreatorUtxo = matchSingle(
    await lucid.utxosByOutRef([cdpCreatorOref]),
    (_) => new Error('Expected a single CDP creator UTXO'),
  );

  match(iassetDatum.price)
    .with({ Delisted: P.any }, () => {
      throw new Error("Can't open CDP of delisted asset");
    })
    .otherwise(() => {});

  const cdpNftVal = mkAssetsOf(
    fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
    1n,
  );

  const iassetTokensVal = mkAssetsOf(
    {
      currencySymbol: sysParams.cdpParams.cdpAssetSymbol.unCurrencySymbol,
      tokenName: iassetDatum.assetName,
    },
    mintedAmount,
  );

  const txValidity = oracleExpirationAwareValidity(
    currentSlot,
    Number(sysParams.cdpCreatorParams.biasTime),
    Number(priceOracleDatum.expiration),
    network,
  );

  const tx = lucid
    .newTx()
    .validFrom(txValidity.validFrom)
    .validTo(txValidity.validTo)
    .readFrom([
      cdpCreatorRefScriptUtxo,
      cdpAuthTokenPolicyRefScriptUtxo,
      iAssetTokenPolicyRefScriptUtxo,
    ])
    .mintAssets(cdpNftVal, Data.void())
    .mintAssets(iassetTokensVal, Data.void())
    .collectFrom(
      [cdpCreatorUtxo],
      serialiseCDPCreatorRedeemer({
        CreateCDP: {
          cdpOwner: pkh.hash,
          minted: mintedAmount,
          collateral: collateralAmount,
          currentTime: currentTime,
        },
      }),
    )
    .pay.ToContract(
      createScriptAddress(network, sysParams.validatorHashes.cdpHash, skh),
      {
        kind: 'inline',
        value: serialiseCdpDatum({
          cdpOwner: pkh.hash,
          iasset: iassetDatum.assetName,
          mintedAmt: mintedAmount,
          cdpFees: {
            ActiveCDPInterestTracking: {
              lastSettled: currentTime,
              unitaryInterestSnapshot:
                calculateUnitaryInterestSinceOracleLastUpdated(
                  currentTime,
                  interestOracleDatum,
                ) + interestOracleDatum.unitaryInterest,
            },
          },
        }),
      },
      addAssets(cdpNftVal, mkLovelacesOf(collateralAmount)),
    )
    .pay.ToContract(
      cdpCreatorUtxo.address,
      { kind: 'inline', value: Data.void() },
      cdpCreatorUtxo.assets,
    )
    .readFrom([priceOracleUtxo, interestOracleUtxo, iassetUtxo])
    .addSignerKey(pkh.hash);

  const debtMintingFee = calculateFeeFromPercentage(
    iassetDatum.debtMintingFeePercentage,
    (mintedAmount * priceOracleDatum.price.getOnChainInt) / 1_000_000n,
  );

  if (debtMintingFee > 0) {
    await collectorFeeTx(debtMintingFee, lucid, sysParams, tx, collectorOref);
  }

  return tx;
}

async function adjustCdp(
  collateralAmount: bigint,
  mintAmount: bigint,
  cdpOref: OutRef,
  iassetOref: OutRef,
  priceOracleOref: OutRef,
  interestOracleOref: OutRef,
  collectorOref: OutRef,
  govOref: OutRef,
  treasuryOref: OutRef,
  sysParams: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  const network = lucid.config().network!;
  const currentTime = BigInt(slotToUnixTime(network, currentSlot));

  const [pkh, _] = await addrDetails(lucid);

  const cdpRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(sysParams.scriptReferences.cdpValidatorRef),
    ]),
    (_) => new Error('Expected a single cdp Ref Script UTXO'),
  );

  const cdpUtxo = matchSingle(
    await lucid.utxosByOutRef([cdpOref]),
    (_) => new Error('Expected a single cdp UTXO'),
  );
  const cdpDatum = parseCdpDatumOrThrow(getInlineDatumOrThrow(cdpUtxo));

  const iassetUtxo = matchSingle(
    await lucid.utxosByOutRef([iassetOref]),
    (_) => new Error('Expected a single iasset UTXO'),
  );
  const iassetDatum = parseIAssetDatumOrThrow(
    getInlineDatumOrThrow(iassetUtxo),
  );

  const govUtxo = matchSingle(
    await lucid.utxosByOutRef([govOref]),
    (_) => new Error('Expected a single gov UTXO'),
  );
  const govDatum = parseGovDatumOrThrow(getInlineDatumOrThrow(govUtxo));

  const priceOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([priceOracleOref]),
    (_) => new Error('Expected a single price oracle UTXO'),
  );
  const priceOracleDatum = parsePriceOracleDatum(
    getInlineDatumOrThrow(priceOracleUtxo),
  );

  const interestOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([interestOracleOref]),
    (_) => new Error('Expected a single interest oracle UTXO'),
  );
  const interestOracleDatum = parseInterestOracleDatum(
    getInlineDatumOrThrow(interestOracleUtxo),
  );

  match(iassetDatum.price)
    .with({ Delisted: P.any }, () => {
      throw new Error("Can't adjust CDP of delisted asset");
    })
    .otherwise(() => {});

  const txValidity = oracleExpirationAwareValidity(
    currentSlot,
    Number(sysParams.cdpCreatorParams.biasTime),
    Number(priceOracleDatum.expiration),
    network,
  );

  const tx = lucid
    .newTx()
    .validFrom(txValidity.validFrom)
    .validTo(txValidity.validTo)
    .collectFrom(
      [cdpUtxo],
      serialiseCdpRedeemer({
        AdjustCdp: {
          collateralAmtChange: collateralAmount,
          currentTime: currentTime,
          mintedAmtChange: mintAmount,
        },
      }),
    )
    .readFrom([cdpRefScriptUtxo])
    .readFrom([iassetUtxo, govUtxo, priceOracleUtxo, interestOracleUtxo])
    .addSignerKey(pkh.hash)
    .pay.ToContract(
      cdpUtxo.address,
      {
        kind: 'inline',
        value: serialiseCdpDatum({
          ...cdpDatum,
          mintedAmt: cdpDatum.mintedAmt + mintAmount,
          cdpFees: {
            ActiveCDPInterestTracking: {
              lastSettled: currentTime,
              unitaryInterestSnapshot:
                calculateUnitaryInterestSinceOracleLastUpdated(
                  currentTime,
                  interestOracleDatum,
                ) + interestOracleDatum.unitaryInterest,
            },
          },
        }),
      },
      addAssets(cdpUtxo.assets, mkLovelacesOf(collateralAmount)),
    );

  if (mintAmount !== 0n) {
    const iAssetTokenPolicyRefScriptUtxo = matchSingle(
      await lucid.utxosByOutRef([
        fromSystemParamsScriptRef(
          sysParams.scriptReferences.iAssetTokenPolicyRef,
        ),
      ]),
      (_) => new Error('Expected a single iasset token policy Ref Script UTXO'),
    );

    const iassetTokensVal = mkAssetsOf(
      {
        currencySymbol: sysParams.cdpParams.cdpAssetSymbol.unCurrencySymbol,
        tokenName: iassetDatum.assetName,
      },
      mintAmount,
    );

    tx.readFrom([iAssetTokenPolicyRefScriptUtxo]).mintAssets(
      iassetTokensVal,
      Data.void(),
    );
  }

  const interestAdaAmt = match(cdpDatum.cdpFees)
    .with({ FrozenCDPAccumulatedFees: P.any }, () => {
      throw new Error('CDP fees wrong');
    })
    .with({ ActiveCDPInterestTracking: P.select() }, (interest) => {
      const interestPaymentIAssetAmt = calculateAccruedInterest(
        currentTime,
        interest.unitaryInterestSnapshot,
        cdpDatum.mintedAmt,
        interest.lastSettled,
        interestOracleDatum,
      );

      return (
        (interestPaymentIAssetAmt * priceOracleDatum.price.getOnChainInt) /
        1_000_000n
      );
    })
    .exhaustive();

  const interestCollectorAdaAmt = calculateFeeFromPercentage(
    iassetDatum.interestCollectorPortionPercentage,
    interestAdaAmt,
  );
  const interestTreasuryAdaAmt = interestAdaAmt - interestCollectorAdaAmt;

  if (interestTreasuryAdaAmt > 0) {
    await TreasuryContract.feeTx(
      interestTreasuryAdaAmt,
      lucid,
      sysParams,
      tx,
      treasuryOref,
    );
  }

  let collectorFee = interestCollectorAdaAmt;

  // when mint
  if (mintAmount > 0n) {
    collectorFee += calculateFeeFromPercentage(
      iassetDatum.debtMintingFeePercentage,
      (mintAmount * priceOracleDatum.price.getOnChainInt) / 1_000_000n,
    );
  }

  // when withdraw
  if (collateralAmount < 0n) {
    collectorFee += calculateFeeFromPercentage(
      govDatum.protocolParams.collateralFeePercentage,
      -collateralAmount,
    );
  }

  if (collectorFee > 0n) {
    await collectorFeeTx(collectorFee, lucid, sysParams, tx, collectorOref);
  }

  return tx;
}

export async function depositCdp(
  amount: bigint,
  cdpOref: OutRef,
  iassetOref: OutRef,
  priceOracleOref: OutRef,
  interestOracleOref: OutRef,
  collectorOref: OutRef,
  govOref: OutRef,
  treasuryOref: OutRef,
  params: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  return adjustCdp(
    amount,
    0n,
    cdpOref,
    iassetOref,
    priceOracleOref,
    interestOracleOref,
    collectorOref,
    govOref,
    treasuryOref,
    params,
    lucid,
    currentSlot,
  );
}

export async function withdrawCdp(
  amount: bigint,
  cdpOref: OutRef,
  iassetOref: OutRef,
  priceOracleOref: OutRef,
  interestOracleOref: OutRef,
  collectorOref: OutRef,
  govOref: OutRef,
  treasuryOref: OutRef,
  params: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  return adjustCdp(
    -amount,
    0n,
    cdpOref,
    iassetOref,
    priceOracleOref,
    interestOracleOref,
    collectorOref,
    govOref,
    treasuryOref,
    params,
    lucid,
    currentSlot,
  );
}

export async function mintCdp(
  amount: bigint,
  cdpOref: OutRef,
  iassetOref: OutRef,
  priceOracleOref: OutRef,
  interestOracleOref: OutRef,
  collectorOref: OutRef,
  govOref: OutRef,
  treasuryOref: OutRef,
  params: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  return adjustCdp(
    0n,
    amount,
    cdpOref,
    iassetOref,
    priceOracleOref,
    interestOracleOref,
    collectorOref,
    govOref,
    treasuryOref,
    params,
    lucid,
    currentSlot,
  );
}

export async function burnCdp(
  amount: bigint,
  cdpOref: OutRef,
  iassetOref: OutRef,
  priceOracleOref: OutRef,
  interestOracleOref: OutRef,
  collectorOref: OutRef,
  govOref: OutRef,
  treasuryOref: OutRef,
  params: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  return adjustCdp(
    0n,
    -amount,
    cdpOref,
    iassetOref,
    priceOracleOref,
    interestOracleOref,
    collectorOref,
    govOref,
    treasuryOref,
    params,
    lucid,
    currentSlot,
  );
}

export async function closeCdp(
  cdpOref: OutRef,
  iassetOref: OutRef,
  priceOracleOref: OutRef,
  interestOracleOref: OutRef,
  collectorOref: OutRef,
  govOref: OutRef,
  treasuryOref: OutRef,
  sysParams: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  const network = lucid.config().network!;
  // Find Pkh, Skh
  const [pkh, _] = await addrDetails(lucid);
  const currentTime = BigInt(slotToUnixTime(network, currentSlot));

  const cdpRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(sysParams.scriptReferences.cdpValidatorRef),
    ]),
    (_) => new Error('Expected a single cdp Ref Script UTXO'),
  );

  const cdpAuthTokenPolicyRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.authTokenPolicies.cdpAuthTokenRef,
      ),
    ]),
    (_) => new Error('Expected a single cdp auth token policy Ref Script UTXO'),
  );

  const iAssetTokenPolicyRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.iAssetTokenPolicyRef,
      ),
    ]),
    (_) => new Error('Expected a single iasset token policy Ref Script UTXO'),
  );

  const cdpUtxo = matchSingle(
    await lucid.utxosByOutRef([cdpOref]),
    (_) => new Error('Expected a single cdp UTXO'),
  );
  const cdpDatum = parseCdpDatumOrThrow(getInlineDatumOrThrow(cdpUtxo));

  const iassetUtxo = matchSingle(
    await lucid.utxosByOutRef([iassetOref]),
    (_) => new Error('Expected a single iasset UTXO'),
  );
  const iassetDatum = parseIAssetDatumOrThrow(
    getInlineDatumOrThrow(iassetUtxo),
  );

  const govUtxo = matchSingle(
    await lucid.utxosByOutRef([govOref]),
    (_) => new Error('Expected a single gov UTXO'),
  );
  const govDatum = parseGovDatumOrThrow(getInlineDatumOrThrow(govUtxo));

  const priceOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([priceOracleOref]),
    (_) => new Error('Expected a single price oracle UTXO'),
  );
  const priceOracleDatum = parsePriceOracleDatum(
    getInlineDatumOrThrow(priceOracleUtxo),
  );

  const interestOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([interestOracleOref]),
    (_) => new Error('Expected a single interest oracle UTXO'),
  );
  const interestOracleDatum = parseInterestOracleDatum(
    getInlineDatumOrThrow(interestOracleUtxo),
  );

  const txValidity = oracleExpirationAwareValidity(
    currentSlot,
    Number(sysParams.cdpCreatorParams.biasTime),
    Number(priceOracleDatum.expiration),
    network,
  );

  const tx = lucid
    .newTx()
    .readFrom([
      cdpRefScriptUtxo,
      iAssetTokenPolicyRefScriptUtxo,
      cdpAuthTokenPolicyRefScriptUtxo,
    ])
    .readFrom([iassetUtxo, govUtxo, priceOracleUtxo, interestOracleUtxo])
    .validFrom(txValidity.validFrom)
    .validTo(txValidity.validTo)
    .mintAssets(
      mkAssetsOf(
        {
          currencySymbol: sysParams.cdpParams.cdpAssetSymbol.unCurrencySymbol,
          tokenName: iassetDatum.assetName,
        },
        -cdpDatum.mintedAmt,
      ),
      Data.void(),
    )
    .mintAssets(
      mkAssetsOf(fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken), -1n),
      Data.void(),
    )
    .collectFrom(
      [cdpUtxo],
      serialiseCdpRedeemer({ CloseCdp: { currentTime: currentTime } }),
    )
    .addSignerKey(pkh.hash);

  const interestAdaAmt = match(cdpDatum.cdpFees)
    .with({ FrozenCDPAccumulatedFees: P.any }, () => {
      throw new Error('CDP fees wrong');
    })
    .with({ ActiveCDPInterestTracking: P.select() }, (interest) => {
      const interestPaymentIAssetAmt = calculateAccruedInterest(
        currentTime,
        interest.unitaryInterestSnapshot,
        cdpDatum.mintedAmt,
        interest.lastSettled,
        interestOracleDatum,
      );

      return (
        (interestPaymentIAssetAmt * priceOracleDatum.price.getOnChainInt) /
        1_000_000n
      );
    })
    .exhaustive();

  const interestCollectorAdaAmt = calculateFeeFromPercentage(
    iassetDatum.interestCollectorPortionPercentage,
    interestAdaAmt,
  );
  const interestTreasuryAdaAmt = interestAdaAmt - interestCollectorAdaAmt;

  if (interestTreasuryAdaAmt > 0) {
    await TreasuryContract.feeTx(
      interestTreasuryAdaAmt,
      lucid,
      sysParams,
      tx,
      treasuryOref,
    );
  }

  const collectorFee =
    interestCollectorAdaAmt +
    calculateFeeFromPercentage(
      govDatum.protocolParams.collateralFeePercentage,
      lovelacesAmt(cdpUtxo.assets) - interestAdaAmt,
    );

  if (collectorFee > 0n) {
    await collectorFeeTx(collectorFee, lucid, sysParams, tx, collectorOref);
  }

  return tx;
}

export async function redeemCdp(
  /**
   * When the goal is to redeem the maximum possible, just pass in the total minted amount of the CDP.
   * The logic will automatically cap the amount to the max.
   */
  attemptedRedemptionIAssetAmt: bigint,
  cdpOref: OutRef,
  iassetOref: OutRef,
  priceOracleOref: OutRef,
  interestOracleOref: OutRef,
  collectorOref: OutRef,
  treasuryOref: OutRef,
  sysParams: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  const network = lucid.config().network!;
  const currentTime = BigInt(slotToUnixTime(network, currentSlot));

  const cdpRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(sysParams.scriptReferences.cdpValidatorRef),
    ]),
    (_) => new Error('Expected a single cdp Ref Script UTXO'),
  );

  const iAssetTokenPolicyRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.iAssetTokenPolicyRef,
      ),
    ]),
    (_) => new Error('Expected a single iasset token policy Ref Script UTXO'),
  );

  const cdpUtxo = matchSingle(
    await lucid.utxosByOutRef([cdpOref]),
    (_) => new Error('Expected a single cdp UTXO'),
  );
  const cdpDatum = parseCdpDatumOrThrow(getInlineDatumOrThrow(cdpUtxo));

  const iassetUtxo = matchSingle(
    await lucid.utxosByOutRef([iassetOref]),
    (_) => new Error('Expected a single iasset UTXO'),
  );
  const iassetDatum = parseIAssetDatumOrThrow(
    getInlineDatumOrThrow(iassetUtxo),
  );

  const priceOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([priceOracleOref]),
    (_) => new Error('Expected a single price oracle UTXO'),
  );
  const priceOracleDatum = parsePriceOracleDatum(
    getInlineDatumOrThrow(priceOracleUtxo),
  );

  const interestOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([interestOracleOref]),
    (_) => new Error('Expected a single interest oracle UTXO'),
  );
  const interestOracleDatum = parseInterestOracleDatum(
    getInlineDatumOrThrow(interestOracleUtxo),
  );

  const interestAdaAmt = match(cdpDatum.cdpFees)
    .with({ FrozenCDPAccumulatedFees: P.any }, () => {
      throw new Error('CDP fees wrong');
    })
    .with({ ActiveCDPInterestTracking: P.select() }, (interest) => {
      const interestPaymentIAssetAmt = calculateAccruedInterest(
        currentTime,
        interest.unitaryInterestSnapshot,
        cdpDatum.mintedAmt,
        interest.lastSettled,
        interestOracleDatum,
      );

      return ocdMul(
        { getOnChainInt: interestPaymentIAssetAmt },
        priceOracleDatum.price,
      ).getOnChainInt;
    })
    .exhaustive();

  const interestCollectorAdaAmt = calculateFeeFromPercentage(
    iassetDatum.interestCollectorPortionPercentage,
    interestAdaAmt,
  );
  const interestTreasuryAdaAmt = interestAdaAmt - interestCollectorAdaAmt;

  const collateralAmtMinusInterest =
    lovelacesAmt(cdpUtxo.assets) - interestAdaAmt;

  const [isPartial, redemptionIAssetAmt] = (() => {
    const res = calculateMinCollateralCappedIAssetRedemptionAmt(
      collateralAmtMinusInterest,
      cdpDatum.mintedAmt,
      priceOracleDatum.price,
      iassetDatum.redemptionRatio,
      iassetDatum.redemptionReimbursementPercentage,
      BigInt(sysParams.cdpParams.minCollateralInLovelace),
    );

    const redemptionAmt = bigintMin(
      attemptedRedemptionIAssetAmt,
      res.cappedIAssetRedemptionAmt,
    );

    return [redemptionAmt < res.cappedIAssetRedemptionAmt, redemptionAmt];
  })();

  if (redemptionIAssetAmt <= 0) {
    throw new Error("There's no iAssets available for redemption.");
  }

  const redemptionLovelacesAmt = ocdMul(priceOracleDatum.price, {
    getOnChainInt: redemptionIAssetAmt,
  }).getOnChainInt;

  const partialRedemptionFee = isPartial
    ? BigInt(sysParams.cdpParams.partialRedemptionExtraFeeLovelace)
    : 0n;

  const processingFee = calculateFeeFromPercentage(
    iassetDatum.redemptionProcessingFeePercentage,
    redemptionLovelacesAmt,
  );

  const reimburstmentFee = calculateFeeFromPercentage(
    iassetDatum.redemptionReimbursementPercentage,
    redemptionLovelacesAmt,
  );

  const txValidity = oracleExpirationAwareValidity(
    currentSlot,
    Number(sysParams.cdpCreatorParams.biasTime),
    Number(priceOracleDatum.expiration),
    network,
  );

  const tx = lucid
    .newTx()
    // Ref Script
    .readFrom([cdpRefScriptUtxo, iAssetTokenPolicyRefScriptUtxo])
    // Ref inputs
    .readFrom([iassetUtxo, priceOracleUtxo, interestOracleUtxo])
    .validFrom(txValidity.validFrom)
    .validTo(txValidity.validTo)
    .collectFrom(
      [cdpUtxo],
      serialiseCdpRedeemer({ RedeemCdp: { currentTime: currentTime } }),
    )
    .mintAssets(
      mkAssetsOf(
        {
          currencySymbol: sysParams.cdpParams.cdpAssetSymbol.unCurrencySymbol,
          tokenName: iassetDatum.assetName,
        },
        -redemptionIAssetAmt,
      ),
      Data.void(),
    )
    .pay.ToContract(
      cdpUtxo.address,
      {
        kind: 'inline',
        value: serialiseCdpDatum({
          ...cdpDatum,
          mintedAmt: cdpDatum.mintedAmt - redemptionIAssetAmt,
          cdpFees: {
            ActiveCDPInterestTracking: {
              lastSettled: currentTime,
              unitaryInterestSnapshot:
                interestOracleDatum.unitaryInterest +
                calculateUnitaryInterestSinceOracleLastUpdated(
                  currentTime,
                  interestOracleDatum,
                ),
            },
          },
        }),
      },
      addAssets(
        cdpUtxo.assets,
        mkLovelacesOf(-redemptionLovelacesAmt),
        mkLovelacesOf(reimburstmentFee),
        mkLovelacesOf(-interestAdaAmt),
      ),
    );

  await collectorFeeTx(
    processingFee + partialRedemptionFee + interestCollectorAdaAmt,
    lucid,
    sysParams,
    tx,
    collectorOref,
  );

  await TreasuryContract.feeTx(
    interestTreasuryAdaAmt,
    lucid,
    sysParams,
    tx,
    treasuryOref,
  );

  return tx;
}

export async function freezeCdp(
  cdpOref: OutRef,
  iassetOref: OutRef,
  priceOracleOref: OutRef,
  interestOracleOref: OutRef,
  sysParams: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  const network = lucid.config().network!;
  const currentTime = BigInt(slotToUnixTime(network, currentSlot));

  const cdpRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(sysParams.scriptReferences.cdpValidatorRef),
    ]),
    (_) => new Error('Expected a single cdp Ref Script UTXO'),
  );
  const cdpUtxo = matchSingle(
    await lucid.utxosByOutRef([cdpOref]),
    (_) => new Error('Expected a single cdp UTXO'),
  );
  const cdpDatum = parseCdpDatumOrThrow(getInlineDatumOrThrow(cdpUtxo));

  const iassetUtxo = matchSingle(
    await lucid.utxosByOutRef([iassetOref]),
    (_) => new Error('Expected a single iasset UTXO'),
  );
  const iassetDatum = parseIAssetDatumOrThrow(
    getInlineDatumOrThrow(iassetUtxo),
  );

  const priceOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([priceOracleOref]),
    (_) => new Error('Expected a single price oracle UTXO'),
  );
  const priceOracleDatum = parsePriceOracleDatum(
    getInlineDatumOrThrow(priceOracleUtxo),
  );

  const interestOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([interestOracleOref]),
    (_) => new Error('Expected a single interest oracle UTXO'),
  );
  const interestOracleDatum = parseInterestOracleDatum(
    getInlineDatumOrThrow(interestOracleUtxo),
  );

  const interestAdaAmt = match(cdpDatum.cdpFees)
    .with({ FrozenCDPAccumulatedFees: P.any }, () => {
      throw new Error('CDP fees wrong');
    })
    .with({ ActiveCDPInterestTracking: P.select() }, (interest) => {
      const interestPaymentIAssetAmt = calculateAccruedInterest(
        currentTime,
        interest.unitaryInterestSnapshot,
        cdpDatum.mintedAmt,
        interest.lastSettled,
        interestOracleDatum,
      );

      const maxInterestLovelaces = computeInterestLovelacesFor100PercentCR(
        lovelacesAmt(cdpUtxo.assets),
        cdpDatum.mintedAmt,
        priceOracleDatum.price,
      );

      return bigintMin(
        maxInterestLovelaces,
        ocdMul(
          { getOnChainInt: interestPaymentIAssetAmt },
          priceOracleDatum.price,
        ).getOnChainInt,
      );
    })
    .exhaustive();

  const interestCollectorAdaAmt = calculateFeeFromPercentage(
    iassetDatum.interestCollectorPortionPercentage,
    interestAdaAmt,
  );

  const interestTreasuryAdaAmt = interestAdaAmt - interestCollectorAdaAmt;

  const inputCollateralMinusInterest =
    lovelacesAmt(cdpUtxo.assets) - interestAdaAmt;

  const cdpDebtAdaValue = ocdMul(
    { getOnChainInt: cdpDatum.mintedAmt },
    priceOracleDatum.price,
  ).getOnChainInt;

  const liquidationProcessingFee = bigintMin(
    calculateFeeFromPercentage(
      iassetDatum.liquidationProcessingFeePercentage,
      inputCollateralMinusInterest,
    ),
    calculateFeeFromPercentage(
      iassetDatum.liquidationProcessingFeePercentage,
      cdpDebtAdaValue,
    ),
  );

  const txValidity = oracleExpirationAwareValidity(
    currentSlot,
    Number(sysParams.cdpCreatorParams.biasTime),
    Number(priceOracleDatum.expiration),
    network,
  );

  return (
    lucid
      .newTx()
      // Ref Script
      .readFrom([cdpRefScriptUtxo])
      // Ref inputs
      .readFrom([iassetUtxo, priceOracleUtxo, interestOracleUtxo])
      .validFrom(txValidity.validFrom)
      .validTo(txValidity.validTo)
      .collectFrom(
        [cdpUtxo],
        serialiseCdpRedeemer({ FreezeCdp: { currentTime: currentTime } }),
      )
      .pay.ToContract(
        createScriptAddress(network, sysParams.validatorHashes.cdpHash),
        {
          kind: 'inline',
          value: serialiseCdpDatum({
            ...cdpDatum,
            cdpOwner: null,
            cdpFees: {
              FrozenCDPAccumulatedFees: {
                lovelacesIndyStakers:
                  liquidationProcessingFee + interestCollectorAdaAmt,
                lovelacesTreasury: interestTreasuryAdaAmt,
              },
            },
          }),
        },
        cdpUtxo.assets,
      )
  );
}

export async function liquidateCdp(
  cdpOref: OutRef,
  stabilityPoolOref: OutRef,
  collectorOref: OutRef,
  treasuryOref: OutRef,
  sysParams: SystemParams,
  lucid: LucidEvolution,
): Promise<TxBuilder> {
  const cdpRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(sysParams.scriptReferences.cdpValidatorRef),
    ]),
    (_) => new Error('Expected a single cdp Ref Script UTXO'),
  );
  const stabilityPoolRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.stabilityPoolValidatorRef,
      ),
    ]),
    (_) => new Error('Expected a single stability pool Ref Script UTXO'),
  );
  const iAssetTokenPolicyRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.iAssetTokenPolicyRef,
      ),
    ]),
    (_) => new Error('Expected a single iasset token policy Ref Script UTXO'),
  );
  const cdpAuthTokenPolicyRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.authTokenPolicies.cdpAuthTokenRef,
      ),
    ]),
    (_) => new Error('Expected a single cdp auth token policy Ref Script UTXO'),
  );

  const cdpUtxo = matchSingle(
    await lucid.utxosByOutRef([cdpOref]),
    (_) => new Error('Expected a single cdp UTXO'),
  );
  const cdpDatum = parseCdpDatumOrThrow(getInlineDatumOrThrow(cdpUtxo));

  const spUtxo = matchSingle(
    await lucid.utxosByOutRef([stabilityPoolOref]),
    (_) => new Error('Expected a single stability pool UTXO'),
  );
  const spDatum = parseStabilityPoolDatum(getInlineDatumOrThrow(spUtxo));

  const [lovelacesForTreasury, lovelacesForCollector] = match(cdpDatum.cdpFees)
    .returnType<[bigint, bigint]>()
    .with({ FrozenCDPAccumulatedFees: P.select() }, (fees) => [
      fees.lovelacesTreasury,
      fees.lovelacesIndyStakers,
    ])
    .with({ ActiveCDPInterestTracking: P.any }, () => {
      throw new Error('CDP fees wrong');
    })
    .exhaustive();

  const cdpNftAc = fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken);
  const iassetsAc = {
    currencySymbol: sysParams.cdpParams.cdpAssetSymbol.unCurrencySymbol,
    tokenName: cdpDatum.iasset,
  };

  const spIassetAmt = assetClassValueOf(spUtxo.assets, iassetsAc);

  const iassetBurnAmt = bigintMin(cdpDatum.mintedAmt, spIassetAmt);

  const collateralAvailable = lovelacesAmt(cdpUtxo.assets);
  const collateralAvailMinusFees =
    collateralAvailable - lovelacesForCollector - lovelacesForTreasury;
  const collateralAbsorbed =
    (collateralAvailMinusFees * iassetBurnAmt) / cdpDatum.mintedAmt;

  const isPartial = spIassetAmt < cdpDatum.mintedAmt;

  const tx = lucid
    .newTx()
    .readFrom([
      cdpRefScriptUtxo,
      stabilityPoolRefScriptUtxo,
      iAssetTokenPolicyRefScriptUtxo,
      cdpAuthTokenPolicyRefScriptUtxo,
    ])
    .collectFrom([spUtxo], serialiseStabilityPoolRedeemer('LiquidateCDP'))
    .collectFrom([cdpUtxo], serialiseCdpRedeemer('Liquidate'))
    .mintAssets(mkAssetsOf(iassetsAc, -iassetBurnAmt), Data.void())
    .pay.ToContract(
      spUtxo.address,
      {
        kind: 'inline',
        value: serialiseStabilityPoolDatum({
          StabilityPool: liquidationHelper(
            spDatum,
            iassetBurnAmt,
            collateralAbsorbed,
          ).newSpContent,
        }),
      },
      addAssets(
        spUtxo.assets,
        mkLovelacesOf(collateralAbsorbed),
        mkAssetsOf(iassetsAc, -iassetBurnAmt),
      ),
    );

  if (isPartial) {
    tx.pay.ToContract(
      cdpUtxo.address,
      {
        kind: 'inline',
        value: serialiseCdpDatum({
          ...cdpDatum,
          mintedAmt: cdpDatum.mintedAmt - spIassetAmt,
          cdpFees: {
            FrozenCDPAccumulatedFees: {
              lovelacesIndyStakers: 0n,
              lovelacesTreasury: 0n,
            },
          },
        }),
      },
      addAssets(
        mkAssetsOf(cdpNftAc, assetClassValueOf(cdpUtxo.assets, cdpNftAc)),
        mkLovelacesOf(collateralAvailable - collateralAbsorbed),
      ),
    );
  } else {
    tx.mintAssets(
      mkAssetsOf(cdpNftAc, -assetClassValueOf(cdpUtxo.assets, cdpNftAc)),
      Data.void(),
    );
  }

  await collectorFeeTx(
    lovelacesForCollector,
    lucid,
    sysParams,
    tx,
    collectorOref,
  );

  await TreasuryContract.feeTx(
    lovelacesForTreasury,
    lucid,
    sysParams,
    tx,
    treasuryOref,
  );

  return tx;
}

export async function mergeCdps(
  cdpsToMergeUtxos: OutRef[],
  sysParams: SystemParams,
  lucid: LucidEvolution,
): Promise<TxBuilder> {
  const cdpRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(sysParams.scriptReferences.cdpValidatorRef),
    ]),
    (_) => new Error('Expected a single cdp Ref Script UTXO'),
  );

  const cdpUtxos = await lucid.utxosByOutRef(cdpsToMergeUtxos);
  const cdpDatums = cdpUtxos.map((utxo) =>
    parseCdpDatumOrThrow(getInlineDatumOrThrow(utxo)),
  );

  if (cdpUtxos.length !== cdpsToMergeUtxos.length) {
    throw new Error('Expected certain number of CDPs');
  }

  const aggregatedVal = F.pipe(
    cdpUtxos,
    A.reduce<UTxO, Assets>({}, (acc, utxo) => addAssets(acc, utxo.assets)),
  );

  const aggregatedMintedAmt = F.pipe(
    cdpDatums,
    A.reduce<CDPContent, bigint>(0n, (acc, cdpDat) => acc + cdpDat.mintedAmt),
  );

  type AggregatedFees = {
    aggregatedFeeIndyStakers: bigint;
    aggregatedFeeTreasury: bigint;
  };

  const { aggregatedFeeTreasury, aggregatedFeeIndyStakers } = F.pipe(
    cdpDatums,
    A.reduce<CDPContent, AggregatedFees>(
      { aggregatedFeeIndyStakers: 0n, aggregatedFeeTreasury: 0n },
      (acc, cdpDat) =>
        match(cdpDat.cdpFees)
          .returnType<AggregatedFees>()
          .with({ FrozenCDPAccumulatedFees: P.select() }, (fees) => ({
            aggregatedFeeIndyStakers:
              acc.aggregatedFeeIndyStakers + fees.lovelacesIndyStakers,
            aggregatedFeeTreasury:
              acc.aggregatedFeeTreasury + fees.lovelacesTreasury,
          }))
          .otherwise(() => acc),
    ),
  );

  const [[mainMergeUtxo, mainCdpDatum], otherMergeUtxos] = match(
    A.zip(cdpUtxos, cdpDatums),
  )
    .returnType<[[UTxO, CDPContent], UTxO[]]>()
    .with([P._, ...P.array()], ([main, ...other]) => [
      main,
      other.map((a) => a[0]),
    ])
    .otherwise(() => {
      throw new Error('Expects more CDPs for merging');
    });

  return lucid
    .newTx()
    .readFrom([cdpRefScriptUtxo])
    .collectFrom([mainMergeUtxo], serialiseCdpRedeemer('MergeCdps'))
    .collectFrom(
      otherMergeUtxos,
      serialiseCdpRedeemer({
        MergeAuxiliary: {
          mainMergeUtxo: {
            outputIndex: BigInt(mainMergeUtxo.outputIndex),
            txHash: { hash: mainMergeUtxo.txHash },
          },
        },
      }),
    )
    .pay.ToContract(
      mainMergeUtxo.address,
      {
        kind: 'inline',
        value: serialiseCdpDatum({
          cdpOwner: null,
          iasset: mainCdpDatum.iasset,
          mintedAmt: aggregatedMintedAmt,
          cdpFees: {
            FrozenCDPAccumulatedFees: {
              lovelacesIndyStakers: aggregatedFeeIndyStakers,
              lovelacesTreasury: aggregatedFeeTreasury,
            },
          },
        }),
      },
      aggregatedVal,
    );
}
