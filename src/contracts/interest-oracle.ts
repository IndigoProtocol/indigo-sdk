import { InterestOracle } from "../types/indigo/interest-oracle";
import { oneYear } from "../helpers/time-helpers";

const unitaryInterestPrecision = 1_000_000_000_000_000_000n;
const decimalUnit = 1_000_000n;

export class InterestOracleContract {
    static calculateUnitaryInterestSinceOracleLastUpdated(now: bigint, oracleDatum: InterestOracle): bigint {
        return InterestOracleContract.calculateUnitaryInterest(now - oracleDatum.lastUpdated, oracleDatum.interestRate.value);
    }

    static calculateUnitaryInterest(timePeriod: bigint, interestRate: bigint): bigint {
        return ((timePeriod * interestRate * unitaryInterestPrecision) / oneYear) / decimalUnit;
    }

    static calculateAccruedInterest(now: bigint, unitaryInterestSnapshot: bigint, mintedAmount: bigint, interestLastSettled: bigint, interestOracleDatum: InterestOracle): bigint {
        if (interestOracleDatum.unitaryInterest >= unitaryInterestSnapshot) {
            const interestFromPreviousRates = ((interestOracleDatum.unitaryInterest - unitaryInterestSnapshot) * mintedAmount) / unitaryInterestPrecision;
            const lastRateInterest = (((now - interestOracleDatum.lastUpdated) * interestOracleDatum.interestRate.value * mintedAmount) / oneYear) / decimalUnit;

            return interestFromPreviousRates + lastRateInterest;
        } else {
            return (((now - interestLastSettled) * interestOracleDatum.interestRate.value * mintedAmount) / oneYear) / decimalUnit;
        }
    }
}