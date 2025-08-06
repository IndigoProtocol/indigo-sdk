import {
  OCD_DECIMAL_UNIT,
  ocdDiv,
  ocdMul,
  OnChainDecimal,
} from '../types/on-chain-decimal';

export function calculateFeeFromPercentage(
  feePercentage: OnChainDecimal,
  amount: bigint,
): bigint {
  if (amount < 0) {
    return 0n;
  }

  return ocdDiv(ocdMul({ getOnChainInt: amount }, feePercentage), {
    getOnChainInt: 100n * OCD_DECIMAL_UNIT,
  }).getOnChainInt;
}
