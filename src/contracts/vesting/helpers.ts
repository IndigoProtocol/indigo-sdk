import { match, P } from 'ts-pattern';
import { ONE_DAY } from '../../utils/time-helpers';
import { OCD_DECIMAL_UNIT } from '../../types/on-chain-decimal';
import { array as A } from 'fp-ts';
import { bigintMax, bigintMin } from '../../utils/bigint-utils';

type Schedule = {
  vestedAtTime: bigint;
  unlockAmt: bigint;
};

type VestingSchedule = {
  maxUnlockable: bigint;
  schedule: Schedule[];
};

export const teamVestingSchedule: Schedule[] = [
  {
    vestedAtTime: 1669067100000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1672523100000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1675201500000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1677620700000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1680299100000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1682891100000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1685569500000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1688161500000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1690839900000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1693518300000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1696110300000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1698788700000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1701380700000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1704059100000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1706737500000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1709243100000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1711921500000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1714513500000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1717191900000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1719783900000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1722462300000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1725140700000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1727732700000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
  {
    vestedAtTime: 1730411100000n,
    unlockAmt: 328_125n * OCD_DECIMAL_UNIT,
  },
];

export const spDistributionSchedule: VestingSchedule = {
  maxUnlockable: 2_013_760n * OCD_DECIMAL_UNIT,
  schedule: [
    {
      vestedAtTime: 1669931100000n,
      unlockAmt: 28_768n * OCD_DECIMAL_UNIT,
    },
  ],
};

export const liqDistributionSchedule: VestingSchedule = {
  maxUnlockable: 316_470n * OCD_DECIMAL_UNIT,
  schedule: [
    {
      vestedAtTime: 1671659100000n,
      unlockAmt: 4_795n * OCD_DECIMAL_UNIT,
    },
  ],
};

export const spLpDistributionSchedule: VestingSchedule = {
  maxUnlockable: 17_016_441n * OCD_DECIMAL_UNIT,
  schedule: [
    {
      vestedAtTime: 1700171100000n,
      unlockAmt: 33_563n * OCD_DECIMAL_UNIT,
    },
  ],
};

export const govDistributionSchedule: VestingSchedule = {
  maxUnlockable: 1_381_248n * OCD_DECIMAL_UNIT,
  schedule: [
    {
      vestedAtTime: 1670363100000n,
      unlockAmt: 2_398n * OCD_DECIMAL_UNIT,
    },
  ],
};

export function calculateTotalVestedTeam(currentTime: bigint): bigint {
  return A.reduce<Schedule, bigint>(0n, (acc, schedule) => {
    if (currentTime >= schedule.vestedAtTime) {
      return acc + schedule.unlockAmt;
    } else {
      return acc;
    }
  })(teamVestingSchedule);
}

export function calculateVestedPerEpoch(
  schedule: VestingSchedule,
  currentTime: bigint,
): bigint {
  const vestingFreq = 5n * ONE_DAY;

  function go(sched: Schedule[]): bigint {
    return (
      match(sched)
        .returnType<bigint>()
        .with([], () => 0n)
        // If the current time is earlier than the first vesting period,
        // the vested INDY is zero.
        // Otherwise, the vested INDY increases by the given amount every epoch
        // after the given date.
        // The + 1 indicates that the first vest happens from the given date
        // (as opposed to having to wait for an epoch to complete)
        .with([P.select()], (sched) =>
          bigintMax(
            0n,
            ((currentTime - sched.vestedAtTime) / vestingFreq + 1n) *
              sched.unlockAmt,
          ),
        )
        // If the current time is past the first period in the schedule,
        // at least all INDY from the first period is vested, and can proceed
        // to compute the vested amount for remaining periods.
        .with([P._, P._, ...P.array()], ([sched1, sched2, ...rest]) =>
          currentTime >= sched2.vestedAtTime
            ? ((sched2.vestedAtTime - sched1.vestedAtTime) / vestingFreq) *
                sched1.unlockAmt +
              go([sched2, ...rest])
            : bigintMax(
                0n,
                ((currentTime - sched1.vestedAtTime) / vestingFreq + 1n) *
                  sched1.unlockAmt,
              ),
        )
        .run()
    );
  }

  return bigintMin(schedule.maxUnlockable, go(schedule.schedule));
}

export function calculateTotalVestedRewards(currentTime: bigint): bigint {
  return (
    calculateVestedPerEpoch(spDistributionSchedule, currentTime) +
    calculateVestedPerEpoch(govDistributionSchedule, currentTime) +
    calculateVestedPerEpoch(liqDistributionSchedule, currentTime) +
    calculateVestedPerEpoch(spLpDistributionSchedule, currentTime)
  );
}
