import Decimal from 'decimal.js';
import {
  OCD_DECIMAL_UNIT,
  ocdAdd,
  ocdCeil,
  ocdDiv,
  ocdMul,
  ocdNegate,
  ocdSub,
  OnChainDecimal,
} from '../types/on-chain-decimal';
import { calculateFeeFromPercentage } from './helpers';

/**
 * The amount of iassets to redeem to reach the RMR.
 */
export function calculateIAssetRedemptionAmt(
  collateralAmt: bigint,
  mintedAmt: bigint,
  price: OnChainDecimal,
  rmr: OnChainDecimal,
): bigint {
  const hundred: OnChainDecimal = {
    getOnChainInt: 100n * OCD_DECIMAL_UNIT,
  };

  const res = ocdAdd(
    ocdNegate(
      ocdDiv({ getOnChainInt: collateralAmt * OCD_DECIMAL_UNIT }, price),
    ),
    ocdDiv(
      ocdMul(rmr, { getOnChainInt: mintedAmt * OCD_DECIMAL_UNIT }),
      hundred,
    ),
  );

  return ocdCeil(
    ocdDiv(
      res,
      ocdSub(ocdDiv(rmr, hundred), {
        getOnChainInt: OCD_DECIMAL_UNIT,
      }),
    ),
  );
}

/**
 * Calculates the allowable redemption amount so the min collateral constraint still holds.
 * It caps the redemption amount to still satisfy the min collateral.
 *
 * Returns uncapped max iassets /\ capped max iassets
 *
 * The derived calculation comes from the following equation where:
 * c - collateral
 * m - min collateral
 * r - reimburstment ratio
 * x - redemption amount
 *
 * `c - x + r * x = m`
 * `-x + r * x = m - c`
 * `x * (r - 1) = m - c`
 * `x = (m - c) / r - 1`
 */
export function calculateMinCollateralCappedIAssetRedemptionAmt(
  collateralAmt: bigint,
  mintedAmt: bigint,
  price: OnChainDecimal,
  rmr: OnChainDecimal,
  reimburstmentPercentage: OnChainDecimal,
  minCollateral: bigint,
): {
  uncappedIAssetRedemptionAmt: bigint;
  cappedIAssetRedemptionAmt: bigint;
} {
  const uncappedMaxIAssetRedemptionAmt = calculateIAssetRedemptionAmt(
    collateralAmt,
    mintedAmt,
    price,
    rmr,
  );
  const uncappedMaxRedemptionLovelacesAmt = ocdMul(price, {
    getOnChainInt: uncappedMaxIAssetRedemptionAmt,
  }).getOnChainInt;

  const maxReimburstment = calculateFeeFromPercentage(
    reimburstmentPercentage.getOnChainInt,
    uncappedMaxRedemptionLovelacesAmt,
  );

  const doesMaxBreakMinCollateral =
    collateralAmt - uncappedMaxRedemptionLovelacesAmt + maxReimburstment <
    minCollateral;

  if (!doesMaxBreakMinCollateral) {
    return {
      uncappedIAssetRedemptionAmt: uncappedMaxIAssetRedemptionAmt,
      cappedIAssetRedemptionAmt: uncappedMaxIAssetRedemptionAmt,
    };
    // already below min collateral
  } else if (collateralAmt <= minCollateral) {
    return {
      uncappedIAssetRedemptionAmt: uncappedMaxIAssetRedemptionAmt,
      cappedIAssetRedemptionAmt: 0n,
    };
  } else {
    const resLovelaces = Decimal(
      (minCollateral - collateralAmt) * 100_000_000n,
    ).div(reimburstmentPercentage.getOnChainInt - 100_000_000n);
    const resIAsset = resLovelaces.div(
      Decimal(price.getOnChainInt).div(OCD_DECIMAL_UNIT),
    );

    return {
      uncappedIAssetRedemptionAmt: uncappedMaxIAssetRedemptionAmt,
      cappedIAssetRedemptionAmt: BigInt(resIAsset.floor().toNumber()),
    };
  }
}
