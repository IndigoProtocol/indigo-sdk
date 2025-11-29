import { InterestOracleDatum } from './types';
import { oneYear } from '../../utils/time-helpers';
import {
  OCD_DECIMAL_UNIT,
  ocdAdd,
  ocdCeil,
  ocdMul,
  OnChainDecimal,
} from '../../types/on-chain-decimal';

const unitaryInterestPrecision = 1_000_000_000_000_000_000n;

export function calculateUnitaryInterest(
  timePeriod: bigint,
  interestRate: bigint,
): bigint {
  return (
    (timePeriod * interestRate * unitaryInterestPrecision) /
    oneYear /
    OCD_DECIMAL_UNIT
  );
}

export function calculateUnitaryInterestSinceOracleLastUpdated(
  now: bigint,
  oracleDatum: InterestOracleDatum,
): bigint {
  return calculateUnitaryInterest(
    now - oracleDatum.lastUpdated,
    oracleDatum.interestRate.getOnChainInt,
  );
}

export function calculateAccruedInterest(
  now: bigint,
  unitaryInterestSnapshot: bigint,
  mintedAmount: bigint,
  interestLastSettled: bigint,
  interestOracleDatum: InterestOracleDatum,
): bigint {
  if (interestOracleDatum.unitaryInterest >= unitaryInterestSnapshot) {
    const interestFromPreviousRates =
      ((interestOracleDatum.unitaryInterest - unitaryInterestSnapshot) *
        mintedAmount) /
      unitaryInterestPrecision;
    const lastRateInterest =
      ((now - interestOracleDatum.lastUpdated) *
        interestOracleDatum.interestRate.getOnChainInt *
        mintedAmount) /
      oneYear /
      OCD_DECIMAL_UNIT;

    return interestFromPreviousRates + lastRateInterest;
  } else {
    return (
      ((now - interestLastSettled) *
        interestOracleDatum.interestRate.getOnChainInt *
        mintedAmount) /
      oneYear /
      OCD_DECIMAL_UNIT
    );
  }
}

/**
 * Calculate the amount of interest needed to achieve 100% collateral ratio.
 */
export function computeInterestLovelacesFor100PercentCR(
  collateral: bigint,
  mintedAmt: bigint,
  price: OnChainDecimal,
): bigint {
  const amt = ocdCeil(
    ocdAdd(
      { getOnChainInt: collateral * OCD_DECIMAL_UNIT },
      ocdMul({ getOnChainInt: -mintedAmt * OCD_DECIMAL_UNIT }, price),
    ),
  );

  if (amt <= 0) {
    return 0n;
  } else {
    return amt;
  }
}
