/**
 * The following is the math related to the leverage calculations.
 *
 * Leverage is the multiplier you apply to the base deposit and you get the amount of final collateral
 * the CDP should have. Additionally, the minted amount is used to pay for fees. The leverage a user picks, is
 * already taking into account the fees, i.e. the fees are paid from the borrowed assets.
 *
 * There's a direct relationship between collateral ratio and leverage multiplier. Each leverage multiplier
 * results in a single collateral ratio and vice versa. Maximum potential leverage is the leverage that
 * results in collateral ratio being the maintenance collateral ratio of the corresponding iAsset.
 *
 * `d` = base deposit
 * `b` = total borrowed value (including the fees)
 * `L` = leverage
 * `f_m` = debt minting fee
 * `f_r` = reimbursement fee
 * `c` = collateral ratio
 *
 * The following is a detailed derivation of the math:
 *
 *  1.  Since the redemption fee is proportional to the borrowed amount,
 *      we can express the ADA we get from the order book as `b'=b*(1-f_r)`,
 *      since some of the borrowed amount goes back to the order book.
 *
 *  2.  Since all the minted iAsset are used to get borrowed ADA,
 *      the value of the minted asset will be `b`.
 *
 *  3.  The minting fee is a percentage of the value of the minted iAsset.
 *      Therefore the available ADA to add as collateral is `b''=b' - b*f_m = b*(1 - f_r - f_m)`.
 *
 *  4.  The collateral ratio can now be expressed as `c = (d + b * (1 - f_r - f_m)) / b`.
 *
 *  5.  Working out the expression, we can express `b` in terms of everything else: `b = d / (c - 1 + f_r + f_m)`.
 *
 *  6.  The minted amount will be `b / asset_price`.
 *
 *  7.  Collateral amount of the CDP is `d + b * (1 - f_r - f_m)`
 *
 *  8.  Leverage calculation: `L = (d + b * (1 - f_r - f_m)) / d`.
 *
 *      Plugging in the `b` formula we get: `L = (d + (d / (c - 1 + f_r + f_m)) * (1 - f_r - f_m)) / d`.
 *
 *      Simplified, yields the following:
 *      `L = 1 + ((1 - f_r - f_m) / (c - 1 + f_r + f_m))`
 *
 *  9.  `b'' = b * (1 - f_r - f_m)`
 *      Solved for `b` yields the following:
 *      `b = b'' / (1 - f_r - f_m)`
 *
 *  10. Having leverage and base deposit, we can find `b''`:
 *      `b’’ = d(L - 1)`
 */

import { UTxO } from '@lucid-evolution/lucid';
import {
  OCD_DECIMAL_UNIT,
  ocdMul,
  OnChainDecimal,
} from '../../types/on-chain-decimal';
import { calculateFeeFromPercentage } from '../../utils/indigo-helpers';
import { bigintMax, bigintMin, fromDecimal } from '../../utils/bigint-utils';
import { array as A, function as F } from 'fp-ts';
import { Decimal } from 'decimal.js';
import { LrpParamsSP } from '../../types/system-params';
import {
  calculateTotalAdaForRedemption,
  lrpRedeemableLovelacesInclReimb,
} from '../lrp/helpers';
import { LRPDatum } from '../lrp/types-new';

/**
 * How many LRP redemptions can we fit into a TX with CDP open.
 */
export const MAX_REDEMPTIONS_WITH_CDP_OPEN = 4;

type LRPRedemptionDetails = {
  utxo: UTxO;
  /**
   * This is including the reimbursement fee.
   **/
  redemptionLovelacesAmtInclReimbursement: bigint;
  iassetsForRedemptionAmt: bigint;
  reimbursementLovelacesAmt: bigint;
};

type ApproximateLeverageRedemptionsResult = {
  leverage: number;
  collateralRatio: OnChainDecimal;
  lovelacesForRedemptionWithReimbursement: bigint;
};
/**
 * We assume exact precision. However, actual redemptions include rounding and
 * the rounding behaviour changes based on the number of redemptions.
 * This may slightly tweak the numbers and the result can be different.
 *
 * The math is described at the top of this code file.
 */
export function approximateLeverageRedemptions(
  baseCollateral: bigint,
  targetLeverage: number,
  redemptionReimbursementPercentage: OnChainDecimal,
  debtMintingFeePercentage: OnChainDecimal,
): ApproximateLeverageRedemptionsResult {
  const debtMintingFeeRatioDecimal = Decimal(
    debtMintingFeePercentage.getOnChainInt,
  )
    .div(OCD_DECIMAL_UNIT)
    .div(100);
  const redemptionReimbursementRatioDecimal = Decimal(
    redemptionReimbursementPercentage.getOnChainInt,
  )
    .div(OCD_DECIMAL_UNIT)
    .div(100);

  const totalFeeRatio = debtMintingFeeRatioDecimal.add(
    redemptionReimbursementRatioDecimal,
  );

  // b''
  const bExFees = Decimal(baseCollateral)
    .mul(targetLeverage)
    .minus(baseCollateral)
    .floor();

  // b = b’’ / (1-f_r - f_m)
  const b = bExFees.div(Decimal(1).minus(totalFeeRatio)).floor();

  // c = (d + b * (1 - f_r - f_m)) / b
  const collateralRatio = {
    getOnChainInt: fromDecimal(
      Decimal(Decimal(baseCollateral).add(bExFees))
        .div(b)
        .mul(100n * OCD_DECIMAL_UNIT)
        .floor(),
    ),
  };

  return {
    leverage: targetLeverage,
    collateralRatio: collateralRatio,
    lovelacesForRedemptionWithReimbursement: fromDecimal(b),
  };
}

export function summarizeActualLeverageRedemptions(
  lovelacesForRedemptionWithReimbursement: bigint,
  redemptionReimbursementPercentage: OnChainDecimal,
  iassetPrice: OnChainDecimal,
  lrpParams: LrpParamsSP,
  // Picking from the beginning until the iasset redemption amount is satisfied.
  redemptionLrps: [UTxO, LRPDatum][],
): {
  redemptions: LRPRedemptionDetails[];
  /**
   * The actual amount received from redemptions (i.e. without the reimbursement fee).
   */
  totalRedeemedLovelaces: bigint;
  /**
   * Total lovelaces amt that has been reimbursted
   */
  totalReimbursementLovelaces: bigint;
  totalRedemptionIAssets: bigint;
} {
  const priceDecimal = Decimal(iassetPrice.getOnChainInt).div(OCD_DECIMAL_UNIT);

  type Accumulator = {
    /// This is including the redemption reimbursement
    remainingRedemptionLovelacesInclReim: bigint;
    redemptions: LRPRedemptionDetails[];
  };

  const redemptionDetails = F.pipe(
    redemptionLrps,
    A.reduce<[UTxO, LRPDatum], Accumulator>(
      {
        remainingRedemptionLovelacesInclReim:
          lovelacesForRedemptionWithReimbursement,
        redemptions: [],
      },
      (acc, lrp) => {
        if (
          acc.remainingRedemptionLovelacesInclReim <
          lrpParams.minRedemptionLovelacesAmt
        ) {
          return acc;
        }

        const lovelacesToSpend = lrpRedeemableLovelacesInclReimb(
          lrp,
          lrpParams,
        );

        if (lovelacesToSpend === 0n) {
          return acc;
        }

        const newRemainingLovelaces = bigintMax(
          acc.remainingRedemptionLovelacesInclReim - lovelacesToSpend,
          0n,
        );
        const redemptionLovelacesInitial =
          acc.remainingRedemptionLovelacesInclReim - newRemainingLovelaces;

        const finalRedemptionIAssets = fromDecimal(
          Decimal(redemptionLovelacesInitial).div(priceDecimal).floor(),
        );
        // We need to calculate the new number since redemptionIAssets got corrected by rounding.
        const finalRedemptionLovelaces = ocdMul(
          {
            getOnChainInt: finalRedemptionIAssets,
          },
          iassetPrice,
        ).getOnChainInt;

        const reimbursementLovelaces = calculateFeeFromPercentage(
          redemptionReimbursementPercentage,
          finalRedemptionLovelaces,
        );

        return {
          remainingRedemptionLovelacesInclReim:
            acc.remainingRedemptionLovelacesInclReim - finalRedemptionLovelaces,
          redemptions: [
            ...acc.redemptions,
            {
              utxo: lrp[0],
              iassetsForRedemptionAmt: finalRedemptionIAssets,
              redemptionLovelacesAmtInclReimbursement: finalRedemptionLovelaces,
              reimbursementLovelacesAmt: reimbursementLovelaces,
            },
          ],
        };
      },
    ),
  );

  const res = F.pipe(
    redemptionDetails.redemptions,
    A.reduce<
      LRPRedemptionDetails,
      {
        redeemedLovelaces: bigint;
        redemptionIAssets: bigint;
        reimbursementLovelaces: bigint;
      }
    >(
      {
        redeemedLovelaces: 0n,
        redemptionIAssets: 0n,
        reimbursementLovelaces: 0n,
      },
      (acc, details) => {
        return {
          redeemedLovelaces:
            acc.redeemedLovelaces +
            details.redemptionLovelacesAmtInclReimbursement -
            details.reimbursementLovelacesAmt,
          reimbursementLovelaces:
            acc.reimbursementLovelaces + details.reimbursementLovelacesAmt,
          redemptionIAssets:
            acc.redemptionIAssets + details.iassetsForRedemptionAmt,
        };
      },
    ),
  );

  return {
    redemptions: redemptionDetails.redemptions,
    totalRedeemedLovelaces: res.redeemedLovelaces,
    totalReimbursementLovelaces: res.reimbursementLovelaces,
    totalRedemptionIAssets: res.redemptionIAssets,
  };
}

/**
 * The math is described at the top of this code file.
 */
export function calculateCollateralRatioFromLeverage(
  iasset: string,
  leverage: number,
  baseCollateral: bigint,
  iassetPrice: OnChainDecimal,
  debtMintingFeePercentage: OnChainDecimal,
  redemptionReimbursementPercentage: OnChainDecimal,
  lrpParams: LrpParamsSP,
  allLrps: [UTxO, LRPDatum][],
): OnChainDecimal | undefined {
  const debtMintingFeeRatioDecimal = Decimal(
    debtMintingFeePercentage.getOnChainInt,
  )
    .div(OCD_DECIMAL_UNIT)
    .div(100);
  const redemptionReimbursementRatioDecimal = Decimal(
    redemptionReimbursementPercentage.getOnChainInt,
  )
    .div(OCD_DECIMAL_UNIT)
    .div(100);

  const totalFeeRatio = debtMintingFeeRatioDecimal.add(
    redemptionReimbursementRatioDecimal,
  );

  const maxAvailableAdaForRedemptionInclReimb = calculateTotalAdaForRedemption(
    iasset,
    iassetPrice,
    lrpParams,
    allLrps,
    MAX_REDEMPTIONS_WITH_CDP_OPEN,
  );

  if (
    leverage <= 1 ||
    baseCollateral <= 0n ||
    maxAvailableAdaForRedemptionInclReimb <= 0n
  ) {
    return undefined;
  }

  // b''
  const bExFees = Decimal(baseCollateral)
    .mul(leverage)
    .minus(baseCollateral)
    .floor();

  // b = b’’ / (1-f_r - f_m)
  const b = bExFees.div(Decimal(1).minus(totalFeeRatio)).floor();

  const cappedB = bigintMin(
    maxAvailableAdaForRedemptionInclReimb,
    fromDecimal(b),
  );

  const cappedBExFees = Decimal(cappedB)
    .mul(Decimal(1).minus(totalFeeRatio))
    .floor();

  // c = (d + b * (1 - f_r - f_m)) / b
  const collateralRatio = Decimal(
    Decimal(baseCollateral).add(cappedBExFees),
  ).div(cappedB);

  return {
    getOnChainInt: fromDecimal(
      collateralRatio.mul(100n * OCD_DECIMAL_UNIT).floor(),
    ),
  };
}

/**
 * The math is described at the top of this code file.
 */
export function calculateLeverageFromCollateralRatio(
  iasset: string,
  collateralRatioPercentage: OnChainDecimal,
  baseCollateral: bigint,
  iassetPrice: OnChainDecimal,
  debtMintingFeePercentage: OnChainDecimal,
  redemptionReimbursementPercentage: OnChainDecimal,
  lrpParams: LrpParamsSP,
  allLrps: [UTxO, LRPDatum][],
): number | undefined {
  const debtMintingFeeRatioDecimal = Decimal(
    debtMintingFeePercentage.getOnChainInt,
  )
    .div(OCD_DECIMAL_UNIT)
    .div(100);
  const redemptionReimbursementRatioDecimal = Decimal(
    redemptionReimbursementPercentage.getOnChainInt,
  )
    .div(OCD_DECIMAL_UNIT)
    .div(100);

  const totalFeeRatio = debtMintingFeeRatioDecimal.add(
    redemptionReimbursementRatioDecimal,
  );

  const collateralRatio = Decimal(collateralRatioPercentage.getOnChainInt)
    .div(OCD_DECIMAL_UNIT)
    .div(100);

  const maxAvailableAdaForRedemptionInclReimb = calculateTotalAdaForRedemption(
    iasset,
    iassetPrice,
    lrpParams,
    allLrps,
    MAX_REDEMPTIONS_WITH_CDP_OPEN,
  );

  if (
    collateralRatio.toNumber() <= 1 ||
    baseCollateral <= 0n ||
    maxAvailableAdaForRedemptionInclReimb <= 0n
  ) {
    return undefined;
  }

  // The leverage unconstrained by the liquidity in LRP
  const theoreticalMaxLeverage = Decimal(Decimal(1).minus(totalFeeRatio))
    .div(collateralRatio.minus(1).add(totalFeeRatio))
    .add(1);

  // b''
  const bExFees = theoreticalMaxLeverage
    .mul(baseCollateral)
    .minus(baseCollateral)
    .floor();

  // b = b’’ / (1-f_r - f_m)
  const b = bExFees.div(Decimal(1).minus(totalFeeRatio)).floor();

  const cappedB = bigintMin(
    maxAvailableAdaForRedemptionInclReimb,
    fromDecimal(b),
  );

  const cappedBExFees = Decimal(cappedB)
    .mul(Decimal(1).minus(totalFeeRatio))
    .floor();

  return Decimal(baseCollateral)
    .add(cappedBExFees)
    .div(baseCollateral)
    .toNumber();
}
