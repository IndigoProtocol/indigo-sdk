import { InterestOracleDatum } from '../types/indigo/interest-oracle';
import { oneYear } from '../helpers/time-helpers';
import { OCD_DECIMAL_UNIT } from '../types/on-chain-decimal';

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
