import { describe, expect, it } from 'vitest';
import { ONE_DAY } from '../src/utils/time-helpers';
import {
  calculateAccruedInterest,
  calculateUnitaryInterestSinceOracleLastUpdated,
} from '../src/contracts/interest-oracle/helpers';

describe('Interest Calculations', () => {
  describe('Calculate Unitary Interest', () => {
    it('Should calculate the unitary interest correctly, 0', () => {
      expect(
        calculateUnitaryInterestSinceOracleLastUpdated(ONE_DAY * 6n, {
          unitaryInterest: 684_931_506_849_315n,
          interestRate: { getOnChainInt: 100_000n },
          lastUpdated: ONE_DAY * 5n,
        }),
      ).toBe(273_972_602_739_726n);
    });

    it('Should calculate the unitary interest correctly, 1', () => {
      expect(
        calculateUnitaryInterestSinceOracleLastUpdated(ONE_DAY * 6n, {
          unitaryInterest: 0n,
          interestRate: { getOnChainInt: 50_000n },
          lastUpdated: 0n,
        }),
      ).toBe(821_917_808_219_178n);
    });

    it('Should calculate the unitary interest correctly, 2', () => {
      expect(
        calculateUnitaryInterestSinceOracleLastUpdated(1n, {
          unitaryInterest: 0n,
          interestRate: { getOnChainInt: 1n },
          lastUpdated: 0n,
        }),
      ).toBe(31n);
    });
  });

  describe('Calculate Accumulated Interest', () => {
    it('Should calculate the accumulated interest correctly, 0', () => {
      expect(
        calculateAccruedInterest(ONE_DAY, 0n, 1_000_000n, 0n, {
          unitaryInterest: 0n,
          interestRate: { getOnChainInt: 50_000n },
          lastUpdated: 0n,
        }),
      ).toBe(136n);
    });

    it('Should calculate the accumulated interest correctly, 1', () => {
      expect(
        calculateAccruedInterest(ONE_DAY * 6n, 0n, 1_000_000n, 0n, {
          unitaryInterest: 684_931_506_849_315n,
          interestRate: { getOnChainInt: 100_000n },
          lastUpdated: ONE_DAY * 5n,
        }),
      ).toBe(684n + 273n);
    });

    it('Should calculate the accumulated interest correctly, 2', () => {
      expect(
        calculateAccruedInterest(ONE_DAY * 17n, 0n, 1_000_000n, 0n, {
          unitaryInterest: 1_506_849_315_068_493n,
          interestRate: { getOnChainInt: 100_000n },
          lastUpdated: ONE_DAY * 15n,
        }),
      ).toBe(1506n + 547n);
    });

    it('Should calculate the accumulated interest correctly, 3', () => {
      expect(
        calculateAccruedInterest(
          ONE_DAY * 17n,
          410_958_904_109_589n,
          1_000_000n,
          ONE_DAY * 3n,
          {
            unitaryInterest: 1_506_849_315_068_493n,
            interestRate: { getOnChainInt: 100_000n },
            lastUpdated: ONE_DAY * 15n,
          },
        ),
      ).toBe(1095n + 547n);
    });

    it('Should calculate the accumulated interest correctly, 4', () => {
      expect(
        calculateAccruedInterest(
          ONE_DAY * 17n,
          767_123_287_671_232n,
          1_000_000n,
          ONE_DAY * 6n,
          {
            unitaryInterest: 1_506_849_315_068_493n,
            interestRate: { getOnChainInt: 100_000n },
            lastUpdated: ONE_DAY * 15n,
          },
        ),
      ).toBe(739n + 547n);
    });

    it('Should calculate the accumulated interest correctly, 5', () => {
      expect(
        calculateAccruedInterest(
          ONE_DAY * 10n,
          821_917_808_219_178n,
          1_000_000n,
          ONE_DAY * 6n,
          {
            unitaryInterest: 0n,
            interestRate: { getOnChainInt: 50_000n },
            lastUpdated: 0n,
          },
        ),
      ).toBe(547n);
    });
  });
});
