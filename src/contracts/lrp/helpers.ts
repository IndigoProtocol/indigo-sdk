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
import { array as A, function as F, ord as Ord } from 'fp-ts';
import { Decimal } from 'decimal.js';
import { insertSorted, shuffle } from '../../utils/array-utils';
import { SystemParams } from '../../types/system-params';
import { match, P } from 'ts-pattern';
import { getInlineDatumOrThrow } from '../../utils/lucid-utils';

export const MIN_LRP_COLLATERAL_AMT = 2_000_000n;

/**
 * How many LRP redemptions can we fit into a TX with CDP open.
 */
const MAX_REDEMPTIONS_WITH_CDP_OPEN = 3;

export function buildRedemptionsTx(
  /** The tuple represents the LRP UTXO and the amount of iAssets to redeem against it. */
  redemptions: [UTxO, bigint][],
  price: OnChainDecimal,
  redemptionReimbursementPercentage: OnChainDecimal,
  sysParams: SystemParams,
  tx: TxBuilder,
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
                ? { Redeem: { continuingOutputIdx: 0n } }
                : {
                    RedeemAuxiliary: {
                      continuingOutputIdx: BigInt(idx),
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
 * Given all available LRP UTXOs, calculate total available ADA that can be redeemed.
 * Taking into account the reimburstment fee and incorrectly initialised LRPs (without base collateral).
 */
// TODO: use this in calculating the max leverage
export function calculateTotalAdaForRedemption(
  redemptionReimbursementPercentage: OnChainDecimal,
  allLrps: [UTxO, LRPDatum][],
): bigint {
  // TODO: do we want to sanity check that all the LRPs correspond to the right iasset.
  return F.pipe(
    allLrps.map(([utxo, datum]) => {
      // This case can happen when LRP is incorrectly initialised.
      if (datum.lovelacesToSpend > lovelacesAmt(utxo.assets)) {
        return bigintMax(
          lovelacesAmt(utxo.assets) - MIN_LRP_COLLATERAL_AMT,
          0n,
        );
      } else {
        return (
          datum.lovelacesToSpend -
          calculateFeeFromPercentage(
            redemptionReimbursementPercentage,
            datum.lovelacesToSpend,
          )
        );
      }
    }),
    // From largest to smallest
    A.sort(Ord.reverse(BigIntOrd)),
    // TODO: take N based on the benchmark, i.e. how many redemptions we can do during CDP open.
    sum,
  );
}

export function calculateIAssetsRedemptionAmtForLeverage(
  leverage: number,
  baseCollateral: bigint,
  iassetPrice: OnChainDecimal,
): bigint {
  const priceDecimal = Decimal(iassetPrice.getOnChainInt).div(OCD_DECIMAL_UNIT);
  const partialLeverage = Decimal(leverage).sub(1);

  return fromDecimal(
    Decimal(baseCollateral).mul(partialLeverage).div(priceDecimal).floor(),
  );
}

type LRPRedemptionDetails = {
  utxo: UTxO;
  // This is including the reimbursement fee.
  redemptionLovelacesAmt: bigint;
  iassetsForRedemptionAmt: bigint;
  reimbursementLovelacesAmt: bigint;
};

export function summarizeLeverage(
  baseCollateral: bigint,
  leverage: number,
  redemptionReimbursementPercentage: OnChainDecimal,
  targetCollateralRatioPercentage: OnChainDecimal,
  iassetPrice: OnChainDecimal,
  debtMintingFeePercentage: OnChainDecimal,
): {
  finalCollateral: bigint;
  lovelacesForRedemptionWithReimbursement: bigint;
} {
  const reimburstmentRatioDecimal = Decimal(
    redemptionReimbursementPercentage.getOnChainInt,
  )
    .div(OCD_DECIMAL_UNIT)
    .div(100);

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

  // This is the amount that has to be received from the LRPs
  const lovelacesForRedemption =
    finalCollateral + mintingFeeLovelaces - baseCollateral;

  // x * (1 + reimbursement_fee) = lovelaces spent from LRP (including the reimbursement fee)
  const lovelacesForRedemptionWithReimbursement = fromDecimal(
    Decimal(lovelacesForRedemption)
      .mul(reimburstmentRatioDecimal.add(1))
      .floor(),
  );

  return {
    finalCollateral: finalCollateral,
    lovelacesForRedemptionWithReimbursement:
      lovelacesForRedemptionWithReimbursement,
  };
}

export function summarizeLeverageRedemptions(
  lovelacesForRedemptionWithReimbursement: bigint,
  redemptionReimbursementPercentage: OnChainDecimal,
  iassetPrice: OnChainDecimal,
  // Picking from the beginning until the iasset redemption amount is satisfied.
  redemptionLrps: [UTxO, LRPDatum][],
): {
  redemptions: LRPRedemptionDetails[];
  // The actual amount received from redemptions (i.e. without the reimbursement fee).
  totalRedeemedLovelaces: bigint;
  totalRedemptionIAssets: bigint;
} {
  const priceDecimal = Decimal(iassetPrice.getOnChainInt).div(OCD_DECIMAL_UNIT);

  type Accumulator = {
    /// This is including the redemption reimbursement
    remainingRedemptionLovelaces: bigint;
    redemptions: LRPRedemptionDetails[];
  };

  const redemptionDetails = F.pipe(
    redemptionLrps,
    A.reduce<[UTxO, LRPDatum], Accumulator>(
      {
        remainingRedemptionLovelaces: lovelacesForRedemptionWithReimbursement,
        redemptions: [],
      },
      (acc, [utxo, datum]) => {
        // TODO: improve/fix this check
        if (acc.remainingRedemptionLovelaces === 0n) {
          return acc;
        }

        const newRemainingLovelaces = bigintMax(
          acc.remainingRedemptionLovelaces - datum.lovelacesToSpend,
          0n,
        );
        const redemptionLovelacesInitial =
          acc.remainingRedemptionLovelaces - newRemainingLovelaces;

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

        const reimburstmentLovelaces = calculateFeeFromPercentage(
          redemptionReimbursementPercentage,
          finalRedemptionLovelaces,
        );

        return {
          remainingRedemptionLovelaces:
            acc.remainingRedemptionLovelaces - finalRedemptionIAssets,
          redemptions: [
            ...acc.redemptions,
            {
              utxo: utxo,
              iassetsForRedemptionAmt: finalRedemptionIAssets,
              redemptionLovelacesAmt: finalRedemptionLovelaces,
              reimbursementLovelacesAmt: reimburstmentLovelaces,
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
      { redeemedLovelaces: bigint; redemptionIAssets: bigint }
    >({ redeemedLovelaces: 0n, redemptionIAssets: 0n }, (acc, details) => {
      return {
        redeemedLovelaces:
          acc.redeemedLovelaces +
          details.redemptionLovelacesAmt -
          details.reimbursementLovelacesAmt,
        redemptionIAssets:
          acc.redemptionIAssets + details.iassetsForRedemptionAmt,
      };
    }),
  );

  return {
    redemptions: redemptionDetails.redemptions,
    totalRedeemedLovelaces: res.redeemedLovelaces,
    totalRedemptionIAssets: res.redemptionIAssets,
  };
}

export function calculateMaxLeverage(
  baseCollateral: bigint,
  targetCollateralRatioPercentage: OnChainDecimal,
  iassetPrice: OnChainDecimal,
  debtMintingFeePercentage: OnChainDecimal,
  // iasset: IAssetContent,
  redemptionReimbursementPercentage: OnChainDecimal,
  allLrps: [UTxO, LRPDatum][],
): number {
  // TODO: check that all the LRPs correspond to the iasset.

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

  const maxAvailableAdaForRedemption = calculateTotalAdaForRedemption(
    redemptionReimbursementPercentage,
    allLrps,
  );

  // TODO: Handle wrong situations here.
  // Total leverage is + 1
  // Total leverage = 1 + (1 / (collateral_ratio - 1))
  const partialLeverage = Decimal(1).div(
    collateralRatioDecimal.sub(Decimal(1)),
  );

  const lovelacesForRedemption = fromDecimal(
    Decimal(baseCollateral).mul(partialLeverage).floor(),
  );

  const reimbursementFee = calculateFeeFromPercentage(
    redemptionReimbursementPercentage,
    lovelacesForRedemption,
  );

  const collateralWithMintingFee =
    baseCollateral +
    bigintMin(
      lovelacesForRedemption - reimbursementFee,
      maxAvailableAdaForRedemption,
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
   * After modifications:
   * `m = c / (p * (r + f))`
   * */
  const mintedAmt = fromDecimal(
    Decimal(collateralWithMintingFee)
      .div(
        priceDecimal.mul(
          debtMintingFeeRatioDecimal.add(collateralRatioDecimal),
        ),
      )
      // Prefer slight higher CR by flooring.
      .floor(),
  );

  const finalCollateral =
    collateralWithMintingFee -
    calculateFeeFromPercentage(
      debtMintingFeePercentage,
      ocdMul({ getOnChainInt: mintedAmt }, iassetPrice).getOnChainInt,
    );

  return Decimal(finalCollateral).div(baseCollateral).toNumber();
  // console.log('Leverage:', partialLeverage.add(1), 'x');
  // console.log(
  //   'Corrected leverage:',
  //   Decimal(totalCollateral).div(baseCollateral),
  //   'x',
  // );
  // console.log('Deposit:', totalCollateral);
  // console.log('Minted amt:', mintedAmt);

  // console.log(
  //   'Collateral ratio:',
  //   Decimal(totalCollateral).div(Decimal(mintedAmt).mul(priceDecimal)).mul(100),
  //   '%',
  // );

  // -----------------------
  // const collateralPerIteration = [Decimal(baseCollateral)];
  // const mintedAmtPerIteration: Decimal[] = [];

  // // TODO: when not converging percentages, throw.

  // while (true) {
  //   const lastDeposit =
  //     collateralPerIteration[collateralPerIteration.length - 1];

  //   const newMintedAmt = lastDeposit.div(
  //     collateralRatioDecimal.mul(priceDecimal),
  //   );

  //   const swappedAda = newMintedAmt
  //     .mul(priceDecimal)
  //     .mul(excludeReimburstmentRatio);

  //   if (newMintedAmt < Decimal(1) || swappedAda < Decimal(1)) {
  //     // Remove last since there's no need to swap it, because we can't mint anything more.
  //     collateralPerIteration.pop();
  //     break;
  //   }

  //   mintedAmtPerIteration.push(newMintedAmt);
  //   collateralPerIteration.push(swappedAda);

  //   // if (i === 5) {
  //   //   break;
  //   // }
  // }

  // console.log('Collaterals per iteration:', collateralPerIteration);
  // console.log('Minted per iteration:', mintedAmtPerIteration);

  // const totalCollateral = A.reduce<Decimal, Decimal>(Decimal(0), (acc, val) =>
  //   acc.add(val),
  // )(collateralPerIteration);

  // const totalMint = A.reduce<Decimal, Decimal>(Decimal(0), (acc, val) =>
  //   acc.add(val),
  // )(mintedAmtPerIteration);

  // const totalCollateralCorrected = fromDecimal(totalCollateral.ceil());
  // const totalMintCorrected = fromDecimal(totalMint.floor());

  // console.log('Collateral:', totalCollateral);
  // console.log('Collateral corrected:', totalCollateralCorrected);
  // console.log('Minted amt:', totalMint);
  // console.log('Minted amt corrected:', totalMintCorrected);

  // console.log(
  //   'Collateral ratio:',
  //   totalCollateral.div(totalMint.mul(priceDecimal)).mul(100),
  //   '%',
  // );
  // console.log(
  //   'Collateral ratio corrected:',
  //   Decimal(totalCollateralCorrected)
  //     .div(Decimal(totalMintCorrected).mul(priceDecimal))
  //     .mul(100),
  //   '%',
  // );

  // console.log('Max leverage:', totalCollateral.div(baseCollateral), 'x');
  // console.log(
  //   'Max leverage corrected:',
  //   Decimal(totalCollateralCorrected).div(baseCollateral),
  //   'x',
  // );

  // BigInt(
  //     // We floor so the resulting collateral ratio not below the target collateral ratio.
  //     .floor()
  //     .toString(),
  // );

  // const swappedAda = baseMintedAmt
  //   .mul(priceDecimal)
  //   .mul(excludeReimburstmentRatio);
}

export function randomLrpsSubsetSatisfyingLeverage(
  // Including the reimbursement percentage
  targetLovelacesToSpend: bigint,
  allLrps: [UTxO, LRPDatum][],
): [UTxO, LRPDatum][] {
  const shuffled = shuffle(allLrps);

  // Sorted from highest to lowest by lovelaces to spend
  let result: [UTxO, LRPDatum][] = [];
  let runningSum = 0n;

  for (let i = 0; i < shuffled.length; i++) {
    const element = shuffled[i];

    result = insertSorted(
      result,
      element,
      Ord.contramap<bigint, [UTxO, LRPDatum]>(
        ([_, dat]) => dat.lovelacesToSpend,
        // From highest to lowest
      )(Ord.reverse(BigIntOrd)),
    );
    runningSum += element[1].lovelacesToSpend;

    // When more items than max allowed, pop the one with smallest value
    if (result.length > MAX_REDEMPTIONS_WITH_CDP_OPEN) {
      const popped = result.pop()!;
      runningSum -= popped[1].lovelacesToSpend;
    }

    if (runningSum >= targetLovelacesToSpend) {
      // TODO: Check whether the minimum redemption is satisfied.
      return result;
    }
  }

  throw new Error("Couldn't achieve target lovelaces");
}
