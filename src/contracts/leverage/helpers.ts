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
import { LRPDatum } from '../lrp/types';

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
 * `d` = base deposit
 * `b` = total borrowed value (including the fees)
 * `L` = leverage
 * `f_m` = debt minting fee
 * `f_r` = reimbursement fee
 * `c` = collateral ratio
 *
 * CDP final collateral:
 * `d + b * (1 - f_r - f_m)`
 *
 * Calculating `b`:
 * `b = d / (c - 1 + f_r + f_m)`
 *
 * Then the calculation for leverage is the following:
 * `L = (d + b * (1 - f_r - f_m)) / d`
 *
 * Plugging in the `b` formula we get:
 * `L = (d + (d / (c - 1 + f_r + f_m)) * (1 - f_r - f_m)) / d`
 *
 * Simplified, yields the following:
 * `L = 1 + ((1 - f_r - f_m) / (c - 1 + f_r + f_m))`
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

  // const collateralRatioDecimal = Decimal(
  //   targetCollateralRatioPercentage.getOnChainInt,
  // )
  //   .div(OCD_DECIMAL_UNIT)
  //   .div(100);
  // const maxAvailableAdaForRedemptionInclReimb = calculateTotalAdaForRedemption(
  //   iasset,
  //   redemptionReimbursementPercentage,
  //   iassetPrice,
  //   lrpParams,
  //   allLrps,
  //   true,
  // );
  // if (
  //   collateralRatioDecimal.toNumber() <= 1 ||
  //   baseCollateral <= 0n ||
  //   maxAvailableAdaForRedemptionInclReimb <= 0n
  // ) {
  //   // The fallback leverage multiplier is 1x which is essentially no leverage.
  //   return 1;
  // }
  // // Total leverage is + 1
  // // Total leverage = 1 + (1 / (collateral_ratio - 1))
  // const partialLeverage = Decimal(1).div(
  //   collateralRatioDecimal.sub(Decimal(1)),
  // );
  // const lovelacesForRedemption = bigintMin(
  //   maxAvailableAdaForRedemptionInclReimb,
  //   fromDecimal(Decimal(baseCollateral).mul(partialLeverage).floor()),
  // );
  // const collateralWithMintingFeeInclReimb =
  //   baseCollateral + lovelacesForRedemption;
  // const mintedAmt = mintedAmtFromCollateralWithMintingFeeInclReimb(
  //   collateralWithMintingFeeInclReimb,
  //   iassetPrice,
  //   debtMintingFeePercentage,
  //   targetCollateralRatioPercentage,
  //   redemptionReimbursementPercentage,
  // );
  // const reimbursementFee = calculateFeeFromPercentage(
  //   redemptionReimbursementPercentage,
  //   ocdMul({ getOnChainInt: mintedAmt }, iassetPrice).getOnChainInt,
  // );
  // const debtMintingFee = calculateFeeFromPercentage(
  //   debtMintingFeePercentage,
  //   ocdMul({ getOnChainInt: mintedAmt }, iassetPrice).getOnChainInt,
  // );
  // const finalCollateral =
  //   collateralWithMintingFeeInclReimb - debtMintingFee - reimbursementFee;
  // return Decimal(finalCollateral).div(baseCollateral).toNumber();
}
