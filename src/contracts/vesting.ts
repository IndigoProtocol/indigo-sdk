import { match, P } from 'ts-pattern';
import { ONE_DAY } from '../helpers/time-helpers';
import { OCD_DECIMAL_UNIT } from '../types/on-chain-decimal';
import { array as A } from 'fp-ts';
import { bigintMax, bigintMin } from '../utils';

type Schedule = {
  vestedAtTime: bigint;
  unlockAmt: bigint;
};

type VestingSchedule = {
  maxUnlockable: bigint;
  schedule: Schedule[];
};

const teamVestingSchedule: Schedule[] = [
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

const spDistributionSchedule: VestingSchedule = {
  maxUnlockable: 14_000_000n * OCD_DECIMAL_UNIT,
  schedule: [
    {
      vestedAtTime: 1669931100000n,
      unlockAmt: 28_768n * OCD_DECIMAL_UNIT,
    },
    {
      vestedAtTime: 1701467100000n,
      unlockAmt: 33_562n * OCD_DECIMAL_UNIT,
    },
    {
      vestedAtTime: 1727387100000n,
      unlockAmt: 33_561n * OCD_DECIMAL_UNIT,
    },
    {
      vestedAtTime: 1733003100000n,
      unlockAmt: 38_356n * OCD_DECIMAL_UNIT,
    },
    {
      vestedAtTime: 1764539100000n,
      unlockAmt: 43_150n * OCD_DECIMAL_UNIT,
    },
    {
      vestedAtTime: 1796075100000n,
      unlockAmt: 47_945n * OCD_DECIMAL_UNIT,
    },
  ],
};

const liqDistributionSchedule: VestingSchedule = {
  maxUnlockable: 5_250_000n * OCD_DECIMAL_UNIT,
  schedule: [
    {
      vestedAtTime: 1671659100000n,
      unlockAmt: 4_795n * OCD_DECIMAL_UNIT,
    },
    {
      vestedAtTime: 1703195100000n,
      unlockAmt: 9_590n * OCD_DECIMAL_UNIT,
    },
    {
      vestedAtTime: 1728683100000n,
      unlockAmt: 9_589n * OCD_DECIMAL_UNIT,
    },
    {
      vestedAtTime: 1734731100000n,
      unlockAmt: 14_383n * OCD_DECIMAL_UNIT,
    },
    {
      vestedAtTime: 1766267100000n,
      unlockAmt: 19_178n * OCD_DECIMAL_UNIT,
    },
    {
      vestedAtTime: 1797803100000n,
      unlockAmt: 23_972n * OCD_DECIMAL_UNIT,
    },
  ],
};

const govDistributionSchedule: VestingSchedule = {
  maxUnlockable: 1_750_000n * OCD_DECIMAL_UNIT,
  schedule: [
    {
      vestedAtTime: 1670363100000n,
      unlockAmt: 2_398n * OCD_DECIMAL_UNIT,
    },
    {
      vestedAtTime: 1701899100000n,
      unlockAmt: 3_596n * OCD_DECIMAL_UNIT,
    },
    {
      vestedAtTime: 1733435100000n,
      unlockAmt: 4_795n * OCD_DECIMAL_UNIT,
    },
    {
      vestedAtTime: 1752443100000n,
      unlockAmt: 4_794n * OCD_DECIMAL_UNIT,
    },
    {
      vestedAtTime: 1764971100000n,
      unlockAmt: 5_993n * OCD_DECIMAL_UNIT,
    },
    {
      vestedAtTime: 1796507100000n,
      unlockAmt: 7_191n * OCD_DECIMAL_UNIT,
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

function calculateVestedPerEpoch(
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
    calculateVestedPerEpoch(liqDistributionSchedule, currentTime)
  );
}
