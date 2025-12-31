import { addAssets, TxBuilder, UTxO } from '@lucid-evolution/lucid';
import {
  LRPDatum,
  parseLrpDatumOrThrow,
  serialiseLrpDatum,
  serialiseLrpRedeemer,
} from './types';
import {
  OCD_DECIMAL_UNIT,
  ocdMul,
  OnChainDecimal,
} from '../../types/on-chain-decimal';
import {
  lovelacesAmt,
  mkAssetsOf,
  mkLovelacesOf,
} from '../../utils/value-helpers';
import { calculateFeeFromPercentage } from '../../utils/indigo-helpers';
import {
  bigintMax,
  bigintMin,
  BigIntOrd,
  fromDecimal,
  sum,
} from '../../utils/bigint-utils';
import { array as A, function as F, ord as Ord, option as O } from 'fp-ts';
import { Decimal } from 'decimal.js';
import { insertSorted, shuffle } from '../../utils/array-utils';
import { LrpParamsSP, SystemParams } from '../../types/system-params';
import { match, P } from 'ts-pattern';
import { getInlineDatumOrThrow } from '../../utils/lucid-utils';

export const MIN_LRP_COLLATERAL_AMT = 2_000_000n;

/**
 * How many LRP redemptions can we fit into a TX with CDP open.
 */
export const MAX_REDEMPTIONS_WITH_CDP_OPEN = 5;

/**
 * Calculate the actually redeemable lovelaces taking into account:
 *  - LRP datum
 *  - UTXO's value
 *  - min redemption
 *
 * This helps to handle incorrectly initialised LRPs, too.
 */
export function lrpRedeemableLovelacesInclReimb(
  lrp: [UTxO, LRPDatum],
  lrpParams: LrpParamsSP,
): bigint {
  const datum = lrp[1];
  const utxo = lrp[0];

  let res = 0n;
  // When incorrectly initialised
  if (datum.lovelacesToSpend > lovelacesAmt(utxo.assets)) {
    res = bigintMax(lovelacesAmt(utxo.assets) - MIN_LRP_COLLATERAL_AMT, 0n);
  } else {
    res = datum.lovelacesToSpend;
  }

  if (res < lrpParams.minRedemptionLovelacesAmt) {
    return 0n;
  }

  return res;
}

export function buildRedemptionsTx(
  /** The tuple represents the LRP UTXO and the amount of iAssets to redeem against it. */
  redemptions: [UTxO, bigint][],
  price: OnChainDecimal,
  redemptionReimbursementPercentage: OnChainDecimal,
  sysParams: SystemParams,
  tx: TxBuilder,
  /**
   * The number of Tx outputs before these.
   */
  txOutputsBeforeCount: bigint,
): TxBuilder {
  const [[mainLrpUtxo, _], __] = match(redemptions)
    .with(
      [P._, ...P.array()],
      ([[firstLrp, _], ...rest]): [[UTxO, bigint], [UTxO, bigint][]] => [
        [firstLrp, _],
        rest,
      ],
    )
    .otherwise(() => {
      throw new Error('Expects at least 1 UTXO to redeem.');
    });

  const mainLrpDatum = parseLrpDatumOrThrow(getInlineDatumOrThrow(mainLrpUtxo));

  return F.pipe(
    redemptions,
    A.reduceWithIndex<[UTxO, bigint], TxBuilder>(
      tx,
      (idx, acc, [lrpUtxo, redeemIAssetAmt]) => {
        const lovelacesForRedemption = ocdMul(
          {
            getOnChainInt: redeemIAssetAmt,
          },
          price,
        ).getOnChainInt;
        const reimburstmentLovelaces = calculateFeeFromPercentage(
          redemptionReimbursementPercentage,
          lovelacesForRedemption,
        );

        const lrpDatum = parseLrpDatumOrThrow(getInlineDatumOrThrow(lrpUtxo));

        const resultVal = addAssets(
          lrpUtxo.assets,
          mkLovelacesOf(-lovelacesForRedemption + reimburstmentLovelaces),
          mkAssetsOf(
            {
              currencySymbol:
                sysParams.lrpParams.iassetPolicyId.unCurrencySymbol,
              tokenName: mainLrpDatum.iasset,
            },
            redeemIAssetAmt,
          ),
        );

        if (lovelacesAmt(resultVal) < MIN_LRP_COLLATERAL_AMT) {
          throw new Error('LRP was incorrectly initialised.');
        }

        return acc
          .collectFrom(
            [lrpUtxo],
            serialiseLrpRedeemer(
              idx === 0
                ? { Redeem: { continuingOutputIdx: txOutputsBeforeCount + 0n } }
                : {
                    RedeemAuxiliary: {
                      continuingOutputIdx: txOutputsBeforeCount + BigInt(idx),
                      mainRedeemOutRef: {
                        txHash: { hash: mainLrpUtxo.txHash },
                        outputIndex: BigInt(mainLrpUtxo.outputIndex),
                      },
                      asset: mainLrpDatum.iasset,
                      assetPrice: price,
                      redemptionReimbursementPercentage:
                        redemptionReimbursementPercentage,
                    },
                  },
            ),
          )
          .pay.ToContract(
            lrpUtxo.address,
            {
              kind: 'inline',
              value: serialiseLrpDatum({
                ...lrpDatum,
                lovelacesToSpend:
                  lrpDatum.lovelacesToSpend - lovelacesForRedemption,
              }),
            },
            resultVal,
          );
      },
    ),
  );
}

/**
 * Given all available LRP UTXOs, calculate total available ADA that can be redeemed. There's
 * a flag to either subtract the reimbursement fee or not.
 * Taking into account the reimburstment fee and incorrectly initialised LRPs (without base collateral).
 */
export function calculateTotalAdaForRedemption(
  iasset: string,
  redemptionReimbursementPercentage: OnChainDecimal,
  iassetPrice: OnChainDecimal,
  lrpParams: LrpParamsSP,
  allLrps: [UTxO, LRPDatum][],
  /**
   * When false, subtracts reimbursement fee from individual redemptions.
   */
  includingReimbursement: boolean = false,
): bigint {
  return F.pipe(
    allLrps,
    A.filterMap(([utxo, datum]) => {
      if (
        datum.iasset !== iasset ||
        datum.maxPrice.getOnChainInt < iassetPrice.getOnChainInt
      ) {
        return O.none;
      }

      const lovelacesToSpend = lrpRedeemableLovelacesInclReimb(
        [utxo, datum],
        lrpParams,
      );

      if (lovelacesToSpend === 0n) {
        return O.none;
      }

      // Subtract the reimbursement fee here on each iteration to simulate real redemptions.
      return O.some(
        lovelacesToSpend -
          (includingReimbursement
            ? 0n
            : calculateFeeFromPercentage(
                redemptionReimbursementPercentage,
                lovelacesToSpend,
              )),
      );
    }),
    // From largest to smallest
    A.sort(Ord.reverse(BigIntOrd)),
    // We can fit only this number of redemptions with CDP open into a single Tx.
    A.takeLeft(MAX_REDEMPTIONS_WITH_CDP_OPEN),
    sum,
  );
}

type LRPRedemptionDetails = {
  utxo: UTxO;
  /**
   * This is including the reimbursement fee.
   **/
  redemptionLovelacesAmtInclReimbursement: bigint;
  iassetsForRedemptionAmt: bigint;
  reimbursementLovelacesAmt: bigint;
};

/**
 * We assume exact precision. However, actual redemptions include rounding and
 * the rounding behaviour changes based on the number of redemptions.
 * This may slightly tweak the numbers and the result can be different.
 */
export function approximateLeverageRedemptions(
  baseCollateral: bigint,
  leverage: number,
  redemptionReimbursementPercentage: OnChainDecimal,
  targetCollateralRatioPercentage: OnChainDecimal,
  iassetPrice: OnChainDecimal,
  debtMintingFeePercentage: OnChainDecimal,
): {
  lovelacesForRedemptionWithReimbursement: bigint;
} {
  const collateralRatioDecimal = Decimal(
    targetCollateralRatioPercentage.getOnChainInt,
  )
    .div(OCD_DECIMAL_UNIT)
    .div(100);

  const priceDecimal = Decimal(iassetPrice.getOnChainInt).div(OCD_DECIMAL_UNIT);

  const finalCollateral = fromDecimal(
    Decimal(baseCollateral).mul(leverage).floor(),
  );

  /**
   * `c` = collateral with minting fee
   * `r` = collateral ratio
   * `p` = price
   * `f` = debt minting fee
   * `m` = minted amount
   *
   * `m = ((c - fpm) / rp)`
   *
   * `c - fmp` = final colateral
   * */
  const mintedAmt = fromDecimal(
    Decimal(finalCollateral)
      .div(collateralRatioDecimal.mul(priceDecimal))
      .floor(),
  );

  const mintingFeeLovelaces = calculateFeeFromPercentage(
    debtMintingFeePercentage,
    ocdMul({ getOnChainInt: mintedAmt }, iassetPrice).getOnChainInt,
  );

  const reimbursementFee = calculateFeeFromPercentage(
    redemptionReimbursementPercentage,
    ocdMul({ getOnChainInt: mintedAmt }, iassetPrice).getOnChainInt,
  );

  // This is the amount that has to be received from the LRPs
  const lovelacesForRedemption =
    finalCollateral + mintingFeeLovelaces + reimbursementFee - baseCollateral;

  return {
    lovelacesForRedemptionWithReimbursement: lovelacesForRedemption,
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
  // The actual amount received from redemptions (i.e. without the reimbursement fee).
  totalRedeemedLovelaces: bigint;
  // Total lovelaces amt that has been reimbursted
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
 * `c` = collateral with minting fee
 * `r` = collateral ratio
 * `p` = price
 * `f` = debt minting fee
 * `k` = reimbursement fee
 * `m` = minted amount
 *
 * `m = ((c - fpm - kpm) / rp)`
 *
 * After modifications:
 * `m = c / (p * (r + f + k))`
 * */
export function mintedAmtFromCollateralWithMintingFeeInclReimb(
  collateralWithMintingFeeInclReimb: bigint,
  iassetPrice: OnChainDecimal,
  debtMintingFeePercentage: OnChainDecimal,
  targetCollateralRatioPercentage: OnChainDecimal,
  redemptionReimbursementPercentage: OnChainDecimal,
): bigint {
  const debtMintingFeeRatioDecimal = Decimal(
    debtMintingFeePercentage.getOnChainInt,
  )
    .div(OCD_DECIMAL_UNIT)
    .div(100);

  const priceDecimal = Decimal(iassetPrice.getOnChainInt).div(OCD_DECIMAL_UNIT);
  const collateralRatioDecimal = Decimal(
    targetCollateralRatioPercentage.getOnChainInt,
  )
    .div(OCD_DECIMAL_UNIT)
    .div(100);

  const redemptionReimbursementRatioDecimal = Decimal(
    redemptionReimbursementPercentage.getOnChainInt,
  )
    .div(OCD_DECIMAL_UNIT)
    .div(100);

  return fromDecimal(
    Decimal(collateralWithMintingFeeInclReimb)
      .div(
        priceDecimal.mul(
          debtMintingFeeRatioDecimal
            .add(collateralRatioDecimal)
            .add(redemptionReimbursementRatioDecimal),
        ),
      )
      // Prefer slight higher CR by flooring.
      .floor(),
  );
}

export function calculateMaxLeverage(
  iasset: string,
  baseCollateral: bigint,
  targetCollateralRatioPercentage: OnChainDecimal,
  iassetPrice: OnChainDecimal,
  debtMintingFeePercentage: OnChainDecimal,
  redemptionReimbursementPercentage: OnChainDecimal,
  lrpParams: LrpParamsSP,
  allLrps: [UTxO, LRPDatum][],
): number {
  const collateralRatioDecimal = Decimal(
    targetCollateralRatioPercentage.getOnChainInt,
  )
    .div(OCD_DECIMAL_UNIT)
    .div(100);

  const maxAvailableAdaForRedemptionInclReimb = calculateTotalAdaForRedemption(
    iasset,
    redemptionReimbursementPercentage,
    iassetPrice,
    lrpParams,
    allLrps,
    true,
  );

  if (
    collateralRatioDecimal.toNumber() <= 1 ||
    baseCollateral <= 0n ||
    maxAvailableAdaForRedemptionInclReimb <= 0n
  ) {
    // The fallback leverage multiplier is 1x which is essentially no leverage.
    return 1;
  }

  // Total leverage is + 1
  // Total leverage = 1 + (1 / (collateral_ratio - 1))
  const partialLeverage = Decimal(1).div(
    collateralRatioDecimal.sub(Decimal(1)),
  );

  const lovelacesForRedemption = bigintMin(
    maxAvailableAdaForRedemptionInclReimb,
    fromDecimal(Decimal(baseCollateral).mul(partialLeverage).floor()),
  );

  const collateralWithMintingFeeInclReimb =
    baseCollateral + lovelacesForRedemption;

  const mintedAmt = mintedAmtFromCollateralWithMintingFeeInclReimb(
    collateralWithMintingFeeInclReimb,
    iassetPrice,
    debtMintingFeePercentage,
    targetCollateralRatioPercentage,
    redemptionReimbursementPercentage,
  );

  const reimbursementFee = calculateFeeFromPercentage(
    redemptionReimbursementPercentage,
    ocdMul({ getOnChainInt: mintedAmt }, iassetPrice).getOnChainInt,
  );

  const debtMintingFee = calculateFeeFromPercentage(
    debtMintingFeePercentage,
    ocdMul({ getOnChainInt: mintedAmt }, iassetPrice).getOnChainInt,
  );

  const finalCollateral =
    collateralWithMintingFeeInclReimb - debtMintingFee - reimbursementFee;

  return Decimal(finalCollateral).div(baseCollateral).toNumber();
}

export function randomLrpsSubsetSatisfyingLeverage(
  iasset: string,
  // Including the reimbursement percentage
  targetLovelacesToSpend: bigint,
  iassetPrice: OnChainDecimal,
  allLrps: [UTxO, LRPDatum][],
  lrpParams: LrpParamsSP,
  randomiseFn: (arr: [UTxO, LRPDatum][]) => [UTxO, LRPDatum][] = shuffle,
): [UTxO, LRPDatum][] {
  if (targetLovelacesToSpend < lrpParams.minRedemptionLovelacesAmt) {
    throw new Error("Can't redeem less than the minimum.");
  }

  const shuffled = randomiseFn(
    F.pipe(
      allLrps,
      A.filter(
        ([_, datum]) =>
          datum.iasset === iasset &&
          datum.maxPrice.getOnChainInt >= iassetPrice.getOnChainInt,
      ),
    ),
  );

  // Sorted from highest to lowest by lovelaces to spend
  let result: [UTxO, LRPDatum][] = [];
  let runningSum = 0n;

  for (let i = 0; i < shuffled.length; i++) {
    const element = shuffled[i];

    const lovelacesToSpend = lrpRedeemableLovelacesInclReimb(
      element,
      lrpParams,
    );

    // Do not add LRPs with smaller lovelacesToSpend than the minRedemption
    // to the random subset.
    if (lovelacesToSpend < lrpParams.minRedemptionLovelacesAmt) {
      continue;
    }

    // When we can't add a new redemption because otherwise the min redemption
    // wouldn't be satisfied.
    // Try to replace the smallest collected with a following larger one when available.
    if (
      result.length > 0 &&
      targetLovelacesToSpend - runningSum < lrpParams.minRedemptionLovelacesAmt
    ) {
      const last = result[result.length - 1];

      // Pop the smallest collected when the current is larger.
      if (lrpRedeemableLovelacesInclReimb(last, lrpParams) < lovelacesToSpend) {
        const popped = result.pop()!;
        runningSum -= lrpRedeemableLovelacesInclReimb(popped, lrpParams);
      } else {
        continue;
      }
    }

    result = insertSorted(
      result,
      element,
      Ord.contramap<bigint, [UTxO, LRPDatum]>(
        ([_, dat]) => dat.lovelacesToSpend,
        // From highest to lowest
      )(Ord.reverse(BigIntOrd)),
    );
    runningSum += lovelacesToSpend;

    // When more items than max allowed, pop the one with smallest value
    if (result.length > MAX_REDEMPTIONS_WITH_CDP_OPEN) {
      const popped = result.pop()!;
      runningSum -= lrpRedeemableLovelacesInclReimb(popped, lrpParams);
    }

    if (runningSum >= targetLovelacesToSpend) {
      return result;
    }
  }

  if (
    targetLovelacesToSpend - runningSum >=
    lrpParams.minRedemptionLovelacesAmt
  ) {
    throw new Error("Couldn't achieve target lovelaces");
  }

  return result;
}
