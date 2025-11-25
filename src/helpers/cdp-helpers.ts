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
import { Network, slotToUnixTime, UTxO } from '@lucid-evolution/lucid';
import { CDPContent } from '../types/indigo/cdp';
import { calculateAccruedInterest } from './interest-oracle';
import { match, P } from 'ts-pattern';
import { InterestOracleDatum } from '../types/indigo/interest-oracle';
import { lovelacesAmt } from './value-helpers';

/**
 * This is mostly for debugging purposes.
 */
export function cdpCollateralRatioPercentage(
  currentSlot: number,
  iassetPrice: OnChainDecimal,
  cdpUtxo: UTxO,
  cdpContent: CDPContent,
  interestOracleDatum: InterestOracleDatum,
  network: Network,
): number {
  const currentTime = BigInt(slotToUnixTime(network, currentSlot));

  return match(cdpContent.cdpFees)
    .with({ ActiveCDPInterestTracking: P.select() }, (interest) => {
      const interestAdaAmt = ocdMul(
        {
          getOnChainInt: calculateAccruedInterest(
            currentTime,
            interest.unitaryInterestSnapshot,
            cdpContent.mintedAmt,
            interest.lastSettled,
            interestOracleDatum,
          ),
        },
        iassetPrice,
      ).getOnChainInt;

      const collateral = lovelacesAmt(cdpUtxo.assets) - interestAdaAmt;

      return (
        Number(
          ocdDiv(
            { getOnChainInt: collateral * 100n },
            ocdMul({ getOnChainInt: cdpContent.mintedAmt }, iassetPrice),
          ).getOnChainInt,
        ) / Number(OCD_DECIMAL_UNIT)
      );
    })
    .with({ FrozenCDPAccumulatedFees: P.any }, () => 0)
    .exhaustive();
}

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
    reimburstmentPercentage,
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
