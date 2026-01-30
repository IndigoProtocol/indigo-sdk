import { addAssets, fromHex, TxBuilder, UTxO } from '@lucid-evolution/lucid';
import { LRPDatum, parseLrpDatumOrThrow, serialiseLrpDatum } from './types';
import { ocdMul, OnChainDecimal } from '../../types/on-chain-decimal';
import {
  lovelacesAmt,
  mkAssetsOf,
  mkLovelacesOf,
} from '../../utils/value-helpers';
import { calculateFeeFromPercentage } from '../../utils/indigo-helpers';
import { bigintMax, BigIntOrd, sum } from '../../utils/bigint-utils';
import { array as A, function as F, ord as Ord, option as O } from 'fp-ts';
import { insertSorted, shuffle } from '../../utils/array-utils';
import { LrpParamsSP, SystemParams } from '../../types/system-params';
import { match, P } from 'ts-pattern';
import { getInlineDatumOrThrow } from '../../utils/lucid-utils';
import { serialiseLrpRedeemer } from './types-new';

export const MIN_LRP_COLLATERAL_AMT = 2_000_000n;

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
                        txHash: { hash: fromHex(mainLrpUtxo.txHash) },
                        outputIndex: BigInt(mainLrpUtxo.outputIndex),
                      },
                      asset: fromHex(mainLrpDatum.iasset),
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
 * Given all available LRP UTXOs, calculate total available ADA that can be redeemed (including reimbursement fee).
 * Taking into account ncorrectly initialised LRPs (without base collateral).
 */
export function calculateTotalAdaForRedemption(
  iasset: string,
  iassetPrice: OnChainDecimal,
  lrpParams: LrpParamsSP,
  allLrps: [UTxO, LRPDatum][],
  /**
   * How many LRPs can be redeemed in a single Tx.
   */
  maxLrpsInTx: number,
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
      return O.some(lovelacesToSpend);
    }),
    // From largest to smallest
    A.sort(Ord.reverse(BigIntOrd)),
    // We can fit only this number of redemptions with CDP open into a single Tx.
    A.takeLeft(maxLrpsInTx),
    sum,
  );
}

export function randomLrpsSubsetSatisfyingTargetLovelaces(
  iasset: string,
  // Including the reimbursement percentage
  targetLovelacesToSpend: bigint,
  iassetPrice: OnChainDecimal,
  allLrps: [UTxO, LRPDatum][],
  lrpParams: LrpParamsSP,
  /**
   * How many LRPs can be redeemed in a single Tx.
   */
  maxLrpsInTx: number,
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
    if (result.length > maxLrpsInTx) {
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
