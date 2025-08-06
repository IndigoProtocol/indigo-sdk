import { Data } from '@lucid-evolution/lucid';

export const OCD_DECIMAL_UNIT: bigint = 1_000_000n;

export const OnChainDecimalSchema = Data.Object({
  getOnChainInt: Data.Integer(),
});
export type OnChainDecimal = Data.Static<typeof OnChainDecimalSchema>;

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
