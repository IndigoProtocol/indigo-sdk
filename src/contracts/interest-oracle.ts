import { Constr, Data } from '@lucid-evolution/lucid';
import { InterestOracleDatum } from '../types/indigo/interest-oracle';
import { oneYear } from '../helpers/time-helpers';

const unitaryInterestPrecision = 1_000_000_000_000_000_000n;
const decimalUnit = 1_000_000n;

export class InterestOracleContract {
  static decodeInterestOracleDatum(datum: string): InterestOracleDatum {
    const oracleDatum = Data.from(datum) as any;
    if (
      oracleDatum.index != 0 ||
      oracleDatum.fields.length !== 3 ||
      oracleDatum.fields[1].index !== 0
    )
      throw 'Invalid Interest Oracle Datum provided.';

    return {
      unitaryInterest: oracleDatum.fields[0],
      interestRate: oracleDatum.fields[1].fields[0],
      lastUpdated: oracleDatum.fields[2],
    };
  }

  static encodeInterestOracleDatum(datum: InterestOracleDatum): string {
    return Data.to(
      new Constr(0, [
        datum.unitaryInterest,
        new Constr(0, [datum.interestRate]),
        datum.lastUpdated,
      ]),
    );
  }

  static calculateUnitaryInterestSinceOracleLastUpdated(
    now: bigint,
    oracleDatum: InterestOracleDatum,
  ): bigint {
    return InterestOracleContract.calculateUnitaryInterest(
      now - oracleDatum.lastUpdated,
      oracleDatum.interestRate,
    );
  }

  static calculateUnitaryInterest(
    timePeriod: bigint,
    interestRate: bigint,
  ): bigint {
    return (
      (timePeriod * interestRate * unitaryInterestPrecision) /
      oneYear /
      decimalUnit
    );
  }

  static calculateAccruedInterest(
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
          interestOracleDatum.interestRate *
          mintedAmount) /
        oneYear /
        decimalUnit;

      return interestFromPreviousRates + lastRateInterest;
    } else {
      return (
        ((now - interestLastSettled) *
          interestOracleDatum.interestRate *
          mintedAmount) /
        oneYear /
        decimalUnit
      );
    }
  }
}
