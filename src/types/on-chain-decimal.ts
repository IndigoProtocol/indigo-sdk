import { Data } from '@lucid-evolution/lucid';

export const OCD_DECIMAL_UNIT: bigint = 1_000_000n;

export const OnChainDecimalSchema = Data.Object({
  getOnChainInt: Data.Integer(),
});
export type OnChainDecimal = Data.Static<typeof OnChainDecimalSchema>;

export function ocdCeil(a: OnChainDecimal): bigint {
  const whole = a.getOnChainInt / OCD_DECIMAL_UNIT;

  return a.getOnChainInt > whole * OCD_DECIMAL_UNIT ? whole + 1n : whole;
}

export function ocdNegate(a: OnChainDecimal): OnChainDecimal {
  return { getOnChainInt: -a.getOnChainInt };
}

export function ocdMul(a: OnChainDecimal, b: OnChainDecimal): OnChainDecimal {
  return {
    getOnChainInt: (a.getOnChainInt * b.getOnChainInt) / OCD_DECIMAL_UNIT,
  };
}

export function ocdDiv(a: OnChainDecimal, b: OnChainDecimal): OnChainDecimal {
  return {
    getOnChainInt: (a.getOnChainInt * OCD_DECIMAL_UNIT) / b.getOnChainInt,
  };
}

export function ocdAdd(a: OnChainDecimal, b: OnChainDecimal): OnChainDecimal {
  return {
    getOnChainInt: a.getOnChainInt + b.getOnChainInt,
  };
}

export function ocdSub(a: OnChainDecimal, b: OnChainDecimal): OnChainDecimal {
  return {
    getOnChainInt: a.getOnChainInt - b.getOnChainInt,
  };
}

export const OCD_ONE: OnChainDecimal = { getOnChainInt: 1_000_000n };
export const OCD_ZERO: OnChainDecimal = { getOnChainInt: 0n };
