import {
  LucidEvolution,
  TxBuilder,
  OutRef,
  UTxO,
  addAssets,
  slotToUnixTime,
  Data,
} from '@lucid-evolution/lucid';
import {
  addrDetails,
  createScriptAddress,
  getInlineDatumOrThrow,
} from '../../utils/lucid-utils';
import { parsePriceOracleDatum } from '../price-oracle/types';
import { ocdMul } from '../../types/on-chain-decimal';
import { parseIAssetDatumOrThrow, serialiseCdpDatum } from '../cdp/types';
import { mkAssetsOf, mkLovelacesOf } from '../../utils/value-helpers';
import { calculateFeeFromPercentage } from '../../utils/indigo-helpers';
import { matchSingle } from '../../utils/utils';
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
  approximateLeverageRedemptions,
  summarizeActualLeverageRedemptions,
  calculateLeverageFromCollateralRatio,
  MAX_REDEMPTIONS_WITH_CDP_OPEN,
} from './helpers';
import { LRPDatum } from '../lrp/types-new';
import {
  buildRedemptionsTx,
  randomLrpsSubsetSatisfyingTargetLovelaces,
} from '../lrp/helpers';

export async function leverageCdpWithLrp(
  leverage: number,
  baseCollateral: bigint,
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

  const maxLeverage = calculateLeverageFromCollateralRatio(
    iassetDatum.assetName,
    iassetDatum.maintenanceRatio,
    baseCollateral,
    priceOracleDatum.price,
    iassetDatum.debtMintingFeePercentage,
    iassetDatum.redemptionReimbursementPercentage,
    sysParams.lrpParams,
    allLrps,
  );

  if (!maxLeverage) {
    throw new Error("Can't calculate max leverage with those parameters.");
  }

  const leverageSummary = approximateLeverageRedemptions(
    baseCollateral,
    leverage,
    iassetDatum.redemptionReimbursementPercentage,
    iassetDatum.debtMintingFeePercentage,
  );

  if (maxLeverage < leverageSummary.leverage) {
    throw new Error("Can't use more leverage than max.");
  }

  if (
    leverageSummary.collateralRatio.getOnChainInt <
    iassetDatum.maintenanceRatio.getOnChainInt
  ) {
    throw new Error(
      "Can't have collateral ratio smaller than maintenance ratio",
    );
  }

  const redemptionDetails = summarizeActualLeverageRedemptions(
    leverageSummary.lovelacesForRedemptionWithReimbursement,
    iassetDatum.redemptionReimbursementPercentage,
    priceOracleDatum.price,
    sysParams.lrpParams,
    randomLrpsSubsetSatisfyingTargetLovelaces(
      iassetDatum.assetName,
      leverageSummary.lovelacesForRedemptionWithReimbursement,
      priceOracleDatum.price,
      allLrps,
      sysParams.lrpParams,
      MAX_REDEMPTIONS_WITH_CDP_OPEN,
    ),
  );

  const mintedAmt = redemptionDetails.totalRedemptionIAssets;

  const debtMintingFee = calculateFeeFromPercentage(
    iassetDatum.debtMintingFeePercentage,
    ocdMul({ getOnChainInt: mintedAmt }, priceOracleDatum.price).getOnChainInt,
  );

  const collateralAmt =
    redemptionDetails.totalRedeemedLovelaces + baseCollateral - debtMintingFee;

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
    // Ref inputs
    .readFrom([priceOracleUtxo, interestOracleUtxo, iassetUtxo])
    // Ref scripts
    .readFrom([
      cdpCreatorRefScriptUtxo,
      cdpAuthTokenPolicyRefScriptUtxo,
      iAssetTokenPolicyRefScriptUtxo,
      lrpScriptRefUtxo,
    ])
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

  buildRedemptionsTx(
    redemptionDetails.redemptions.map((r) => [
      r.utxo,
      r.iassetsForRedemptionAmt,
    ]),
    priceOracleDatum.price,
    iassetDatum.redemptionReimbursementPercentage,
    sysParams,
    tx,
    2n,
  );

  if (debtMintingFee > 0) {
    await collectorFeeTx(debtMintingFee, lucid, sysParams, tx, collectorOref);
  }

  return tx;
}
