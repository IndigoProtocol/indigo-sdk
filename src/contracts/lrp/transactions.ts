import {
  LucidEvolution,
  TxBuilder,
  Credential,
  OutRef,
  UTxO,
  addAssets,
  unixTimeToSlot,
  slotToUnixTime,
  Data,
} from '@lucid-evolution/lucid';
import {
  addrDetails,
  createScriptAddress,
  getInlineDatumOrThrow,
} from '../../utils/lucid-utils';
import { unzip, zip } from 'fp-ts/lib/Array';
import {
  LRPDatum,
  parseLrpDatumOrThrow,
  serialiseLrpDatum,
  serialiseLrpRedeemer,
} from './types';
import { parsePriceOracleDatum } from '../price-oracle/types';
import { OnChainDecimal } from '../../types/on-chain-decimal';
import { parseIAssetDatumOrThrow, serialiseCdpDatum } from '../cdp/types';
import {
  assetClassValueOf,
  mkAssetsOf,
  mkLovelacesOf,
} from '../../utils/value-helpers';
import { calculateFeeFromPercentage } from '../../utils/indigo-helpers';
import { matchSingle } from '../../utils/utils';
import { AssetClass } from '../../types/generic';
import {
  fromSystemParamsAsset,
  fromSystemParamsScriptRef,
  SystemParams,
} from '../../types/system-params';
import { oracleExpirationAwareValidity } from '../price-oracle/helpers';
import { parseInterestOracleDatum } from '../interest-oracle/types';
import { serialiseCDPCreatorRedeemer } from '../cdp-creator/types';
import { collectorFeeTx } from '../collector/transactions';
import { calculateUnitaryInterestSinceOracleLastUpdated } from '../interest-oracle/helpers';
import {
  buildRedemptionsTx,
  MIN_LRP_COLLATERAL_AMT,
  randomLrpsSubsetSatisfyingLeverage,
  summarizeLeverage,
  summarizeLeverageRedemptions,
} from './helpers';

export async function openLrp(
  assetTokenName: string,
  lovelacesAmt: bigint,
  maxPrice: OnChainDecimal,
  lucid: LucidEvolution,
  sysParams: SystemParams,
  lrpStakeCredential?: Credential,
): Promise<TxBuilder> {
  const network = lucid.config().network!;

  const [ownPkh, _] = await addrDetails(lucid);

  const newDatum: LRPDatum = {
    owner: ownPkh.hash,
    iasset: assetTokenName,
    maxPrice: maxPrice,
    lovelacesToSpend: lovelacesAmt,
  };

  return lucid.newTx().pay.ToContract(
    createScriptAddress(
      network,
      sysParams.validatorHashes.lrpHash,
      lrpStakeCredential,
    ),
    {
      kind: 'inline',
      value: serialiseLrpDatum(newDatum),
    },
    { lovelace: lovelacesAmt + MIN_LRP_COLLATERAL_AMT },
  );
}

export async function cancelLrp(
  lrpOutRef: OutRef,
  sysParams: SystemParams,
  lucid: LucidEvolution,
): Promise<TxBuilder> {
  const lrpScriptRefUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(sysParams.scriptReferences.lrpValidatorRef),
    ]),
    (_) => new Error('Expected a single LRP Ref Script UTXO'),
  );

  const lrpUtxo = matchSingle(
    await lucid.utxosByOutRef([lrpOutRef]),
    (_) => new Error('Expected a single LRP UTXO.'),
  );

  const lrpDatum = parseLrpDatumOrThrow(getInlineDatumOrThrow(lrpUtxo));

  return lucid
    .newTx()
    .readFrom([lrpScriptRefUtxo])
    .collectFrom([lrpUtxo], serialiseLrpRedeemer('Cancel'))
    .addSignerKey(lrpDatum.owner);
}

export async function redeemLrp(
  /** The tuple represents the LRP outref and the amount of iAssets to redeem against it. */
  redemptionLrpsData: [OutRef, bigint][],
  priceOracleOutRef: OutRef,
  iassetOutRef: OutRef,
  lucid: LucidEvolution,
  sysParams: SystemParams,
): Promise<TxBuilder> {
  const network = lucid.config().network!;

  const lrpScriptRefUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(sysParams.scriptReferences.lrpValidatorRef),
    ]),
    (_) => new Error('Expected a single LRP Ref Script UTXO'),
  );

  const priceOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([priceOracleOutRef]),
    (_) => new Error('Expected a single price oracle UTXO'),
  );

  const iassetUtxo = matchSingle(
    await lucid.utxosByOutRef([iassetOutRef]),
    (_) => new Error('Expected a single IAsset UTXO'),
  );

  const iassetDatum = parseIAssetDatumOrThrow(
    getInlineDatumOrThrow(iassetUtxo),
  );

  const [lrpsToRedeemOutRefs, lrpRedemptionIAssetAmt] =
    unzip(redemptionLrpsData);

  const priceOracleDatum = parsePriceOracleDatum(
    getInlineDatumOrThrow(priceOracleUtxo),
  );

  const redemptionLrps = await lucid
    .utxosByOutRef(lrpsToRedeemOutRefs)
    .then((val) => zip(val, lrpRedemptionIAssetAmt));

  const tx = buildRedemptionsTx(
    redemptionLrps,
    priceOracleDatum.price,
    iassetDatum.redemptionReimbursementPercentage,
    sysParams,
    lucid.newTx(),
  );

  return (
    lucid
      .newTx()
      .validTo(
        slotToUnixTime(
          network,
          unixTimeToSlot(network, Number(priceOracleDatum.expiration)) - 1,
        ),
      )
      // Ref script
      .readFrom([lrpScriptRefUtxo])
      // Ref inputs
      .readFrom([iassetUtxo, priceOracleUtxo])
      .compose(tx)
  );
}

export async function redeemLrpWithCdpOpen(
  leverage: number,
  baseCollateral: bigint,
  targetCollateralRatioPercentage: OnChainDecimal,

  priceOracleOutRef: OutRef,
  iassetOutRef: OutRef,
  cdpCreatorOref: OutRef,
  interestOracleOref: OutRef,
  collectorOref: OutRef,
  sysParams: SystemParams,
  lucid: LucidEvolution,
  allLrps: [UTxO, LRPDatum][],
  currentSlot: number,
): Promise<TxBuilder> {
  const network = lucid.config().network!;
  const currentTime = BigInt(slotToUnixTime(network, currentSlot));

  const [pkh, skh] = await addrDetails(lucid);

  // TODO: check that the requested leverage is smaller than the max leverage.

  const lrpScriptRefUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(sysParams.scriptReferences.lrpValidatorRef),
    ]),
    (_) => new Error('Expected a single LRP Ref Script UTXO'),
  );

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

  const cdpCreatorUtxo = matchSingle(
    await lucid.utxosByOutRef([cdpCreatorOref]),
    (_) => new Error('Expected a single CDP creator UTXO'),
  );

  const interestOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([interestOracleOref]),
    (_) => new Error('Expected a single interest oracle UTXO'),
  );
  const interestOracleDatum = parseInterestOracleDatum(
    getInlineDatumOrThrow(interestOracleUtxo),
  );

  const priceOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([priceOracleOutRef]),
    (_) => new Error('Expected a single price oracle UTXO'),
  );
  const priceOracleDatum = parsePriceOracleDatum(
    getInlineDatumOrThrow(priceOracleUtxo),
  );

  const iassetUtxo = matchSingle(
    await lucid.utxosByOutRef([iassetOutRef]),
    (_) => new Error('Expected a single IAsset UTXO'),
  );
  const iassetDatum = parseIAssetDatumOrThrow(
    getInlineDatumOrThrow(iassetUtxo),
  );

  // We don't return the mintedAmt here, because it depends on the individual redemptions.
  const leverageSummary = summarizeLeverage(
    baseCollateral,
    leverage,
    iassetDatum.redemptionReimbursementPercentage,
    targetCollateralRatioPercentage,
    priceOracleDatum.price,
    iassetDatum.debtMintingFeePercentage,
  );

  const redemptionDetails = summarizeLeverageRedemptions(
    leverageSummary.lovelacesForRedemptionWithReimbursement,
    iassetDatum.redemptionReimbursementPercentage,
    priceOracleDatum.price,
    randomLrpsSubsetSatisfyingLeverage(
      leverageSummary.lovelacesForRedemptionWithReimbursement,
      allLrps,
    ),
  );

  const txValidity = oracleExpirationAwareValidity(
    currentSlot,
    Number(sysParams.cdpCreatorParams.biasTime),
    Number(priceOracleDatum.expiration),
    network,
  );

  const tx = buildRedemptionsTx(
    redemptionDetails.redemptions.map((r) => [
      r.utxo,
      r.iassetsForRedemptionAmt,
    ]),
    priceOracleDatum.price,
    iassetDatum.redemptionReimbursementPercentage,
    sysParams,
    lucid.newTx(),
  );

  const mintedAmt = redemptionDetails.totalRedemptionIAssets;
  // TODO: this should probably come from the redemptionDetails
  const collateralAmt = leverageSummary.finalCollateral;

  const cdpNftVal = mkAssetsOf(
    fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
    1n,
  );

  const iassetTokensVal = mkAssetsOf(
    {
      currencySymbol: sysParams.cdpParams.cdpAssetSymbol.unCurrencySymbol,
      tokenName: iassetDatum.assetName,
    },
    mintedAmt,
  );

  tx.validFrom(txValidity.validFrom)
    .validTo(txValidity.validTo)
    // Ref scripts
    .readFrom([
      cdpCreatorRefScriptUtxo,
      cdpAuthTokenPolicyRefScriptUtxo,
      iAssetTokenPolicyRefScriptUtxo,
      lrpScriptRefUtxo,
    ])
    // Ref inputs
    .readFrom([priceOracleUtxo, interestOracleUtxo, iassetUtxo])
    .mintAssets(cdpNftVal, Data.void())
    .mintAssets(iassetTokensVal, Data.void())
    .collectFrom(
      [cdpCreatorUtxo],
      serialiseCDPCreatorRedeemer({
        CreateCDP: {
          cdpOwner: pkh.hash,
          minted: mintedAmt,
          collateral: collateralAmt,
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
          mintedAmt: mintedAmt,
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
      addAssets(cdpNftVal, mkLovelacesOf(collateralAmt)),
    )
    .pay.ToContract(
      cdpCreatorUtxo.address,
      { kind: 'inline', value: Data.void() },
      cdpCreatorUtxo.assets,
    )
    .addSignerKey(pkh.hash);

  const debtMintingFee = calculateFeeFromPercentage(
    iassetDatum.debtMintingFeePercentage,
    (mintedAmt * priceOracleDatum.price.getOnChainInt) / 1_000_000n,
  );

  if (debtMintingFee > 0) {
    await collectorFeeTx(debtMintingFee, lucid, sysParams, tx, collectorOref);
  }

  return tx;
}

/**
 * Create Tx adjusting the LRP and claiming the received iAssets
 */
export async function adjustLrp(
  lucid: LucidEvolution,
  lrpOutRef: OutRef,
  /**
   * A positive amount increases the lovelaces in the LRP,
   * and a negative amount takes lovelaces from the LRP.
   */
  lovelacesAdjustAmt: bigint,
  sysParams: SystemParams,
): Promise<TxBuilder> {
  const lrpScriptRefUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(sysParams.scriptReferences.lrpValidatorRef),
    ]),
    (_) => new Error('Expected a single LRP Ref Script UTXO'),
  );

  const lrpUtxo = matchSingle(
    await lucid.utxosByOutRef([lrpOutRef]),
    (_) => new Error('Expected a single LRP UTXO.'),
  );

  const lrpDatum = parseLrpDatumOrThrow(getInlineDatumOrThrow(lrpUtxo));

  const rewardAssetClass: AssetClass = {
    currencySymbol: sysParams.lrpParams.iassetPolicyId.unCurrencySymbol,
    tokenName: lrpDatum.iasset,
  };
  const rewardAssetsAmt = assetClassValueOf(lrpUtxo.assets, rewardAssetClass);

  // The claim case
  if (lovelacesAdjustAmt === 0n && lrpDatum.lovelacesToSpend === 0n) {
    throw new Error(
      "When there's no more lovelaces to spend, use close instead of claim.",
    );
  }

  // Negative adjust case
  if (
    lovelacesAdjustAmt < 0 &&
    lrpDatum.lovelacesToSpend <= lovelacesAdjustAmt
  ) {
    throw new Error(
      "Can't adjust negatively by more than available. Also, for adjusting by exactly the amount deposited, a close action should be used instead.",
    );
  }

  return lucid
    .newTx()
    .readFrom([lrpScriptRefUtxo])
    .collectFrom([lrpUtxo], serialiseLrpRedeemer('Cancel'))
    .pay.ToContract(
      lrpUtxo.address,
      {
        kind: 'inline',
        value: serialiseLrpDatum({
          ...lrpDatum,
          lovelacesToSpend: lrpDatum.lovelacesToSpend + lovelacesAdjustAmt,
        }),
      },
      addAssets(
        lrpUtxo.assets,
        mkAssetsOf(rewardAssetClass, -rewardAssetsAmt),
        mkLovelacesOf(lovelacesAdjustAmt),
      ),
    )
    .addSignerKey(lrpDatum.owner);
}

/**
 * Create Tx claiming the received iAssets.
 */
export async function claimLrp(
  lucid: LucidEvolution,
  lrpOutRef: OutRef,
  sysParams: SystemParams,
): Promise<TxBuilder> {
  return adjustLrp(lucid, lrpOutRef, 0n, sysParams);
}
