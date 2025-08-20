import { OutRef, UTxO } from '@lucid-evolution/lucid';
import {
  EpochToScaleToSum,
  fromSPInteger,
  mkSPInteger,
  parseSnapshotEpochToScaleToSumDatum,
  parseStabilityPoolDatum,
  SnapshotEpochToScaleToSumContent,
  spAdd,
  spDiv,
  SPInteger,
  spMul,
  spSub,
  StabilityPoolSnapshot,
} from '../types/indigo/stability-pool';

const newScaleMultiplier = 1000000000n;

export function getAccountReward(
  account: StabilityPoolSnapshot,
  e2s2s: EpochToScaleToSum,
): SPInteger {
  const s1 = getSumFromEpochToScaleToSum(e2s2s, account.epoch, account.scale);
  if (!s1) throw new Error('No scale found for epoch and scale');
  const s2 = getSumFromEpochToScaleToSum(e2s2s, account.epoch, account.scale + 1n) ?? s1;
  const a1 = spSub(s1, account.sumVal);
  const a2 = spDiv(spSub(s2, s1), mkSPInteger(newScaleMultiplier));

  return spDiv(spMul(spAdd(a1, a2), account.depositVal), account.productVal);
}

export function getAccountFund(pool: StabilityPoolSnapshot, account: StabilityPoolSnapshot): SPInteger {
    let fund = spDiv(spMul(account.depositVal, pool.productVal), account.productVal);
    if (pool.epoch > account.epoch) fund = mkSPInteger(0n);
    if (pool.scale - account.scale > 1n) fund = mkSPInteger(0n);
    if (pool.scale > account.scale) fund = spDiv(spMul(account.depositVal, pool.productVal), {value: account.productVal.value * newScaleMultiplier});

    if (fund.value < spDiv(account.depositVal, mkSPInteger(1000000000n)).value) return mkSPInteger(0n);
    return fund;
}

export function adjust(pool: StabilityPoolSnapshot, account: StabilityPoolSnapshot, e2s2s: EpochToScaleToSum): [StabilityPoolSnapshot, bigint] {
    const newAccountSnapshot: StabilityPoolSnapshot = {
        ...pool,
        depositVal: getAccountFund(pool, account)
    }

    const accountReward = fromSPInteger(getAccountReward(account, e2s2s));

    return [newAccountSnapshot, accountReward];
}

type SnapshotESSSearchResult = {utxo: UTxO, e2s2s: EpochToScaleToSum};

function findEpochToScaleToSum(snapshotEpochToScaleToSumTokenRef1: UTxO, snapshotEpochToScaleToSumTokenRef2: UTxO | undefined): [SnapshotESSSearchResult, SnapshotESSSearchResult | undefined] {
    let ess1;
    try {
        ess1 = parseSnapshotEpochToScaleToSumDatum(snapshotEpochToScaleToSumTokenRef1.datum).snapshot;
    } catch (e) {
        ess1 = parseStabilityPoolDatum(snapshotEpochToScaleToSumTokenRef1.datum).epochToScaleToSum;
    }

    const ess1Ref: SnapshotESSSearchResult = { utxo: snapshotEpochToScaleToSumTokenRef1, e2s2s: ess1};

    if (snapshotEpochToScaleToSumTokenRef2) {
        const ess2 = parseSnapshotEpochToScaleToSumDatum(snapshotEpochToScaleToSumTokenRef2.datum);
        const ess2Ref: SnapshotESSSearchResult = { utxo: snapshotEpochToScaleToSumTokenRef2, e2s2s: ess2.snapshot};
        return [ess1Ref, ess2Ref];
    }

    return [ess1Ref, undefined];
}

export function adjustmentHelper(spESTSTokenRef1: UTxO, spESTSTokenRef2: UTxO | undefined, pool: StabilityPoolSnapshot, e2s2s: EpochToScaleToSum, account: StabilityPoolSnapshot): [StabilityPoolSnapshot, bigint, UTxO[]] {
    let accumulatedEpochToScaleToSum: EpochToScaleToSum;
    let refInputs: UTxO[];

    const value = getSumFromEpochToScaleToSum(e2s2s, account.epoch, account.scale);

    if (value) {
        accumulatedEpochToScaleToSum = e2s2s;
        refInputs = [];
    } else {
        const [ess1, ess2] = findEpochToScaleToSum(spESTSTokenRef1, spESTSTokenRef2);
        if (ess2) {
            accumulatedEpochToScaleToSum = new Map<{epoch: bigint, scale: bigint}, SPInteger>(
                [
                    ...Array.from(ess1.e2s2s.entries()), 
                    ...Array.from(ess2.e2s2s.entries()), 
                    ...Array.from(e2s2s.entries()), 
                ]
            );
            refInputs = [ess1.utxo, ess2.utxo];
        } else {
            accumulatedEpochToScaleToSum = new Map<{epoch: bigint, scale: bigint}, SPInteger>(
                [
                    ...Array.from(ess1.e2s2s.entries()), 
                    ...Array.from(e2s2s.entries()), 
                ]
            );
            refInputs = [ess1.utxo];
        }
    }

    const [newAccountSnapshot, accountReward] = adjust(pool, account, accumulatedEpochToScaleToSum);

    return [newAccountSnapshot, accountReward, refInputs];
}

export function updatePoolSnapshotWithdrawalFee(withdrawalFeeAmount: SPInteger, newPoolDepositExcludingFee: SPInteger, pool: StabilityPoolSnapshot): [SPInteger, SPInteger] {
    const newPoolDepositVal = spAdd(newPoolDepositExcludingFee, withdrawalFeeAmount);
    const newPoolProduct = withdrawalFeeAmount.value === 0n ? pool.productVal : spMul(pool.productVal, spAdd(mkSPInteger(1n), spDiv(withdrawalFeeAmount, newPoolDepositExcludingFee)));

    return [newPoolDepositVal, newPoolProduct];
}

export function getSumFromEpochToScaleToSum(e2s2s: EpochToScaleToSum, epoch: bigint, scale: bigint): SPInteger | undefined {
    for (const [key, value] of e2s2s.entries()) {
        if (key.epoch === epoch && key.scale === scale) {
            return value;
        }
    }
    return undefined;
}

export function setSumInEpochToScaleToSum(e2s2s: EpochToScaleToSum, epoch: bigint, scale: bigint, sum: SPInteger): EpochToScaleToSum {
    const map = new Map<{epoch: bigint, scale: bigint}, SPInteger>();
    for (const [key, value] of e2s2s.entries()) {
        if (!(key.epoch === epoch && key.scale === scale)) {
            map.set(key, value);
        }
    }

    map.set({epoch, scale}, sum);

    return map;
}