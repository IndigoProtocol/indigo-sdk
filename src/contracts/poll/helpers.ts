import {
  calculateTotalVestedRewards,
  calculateTotalVestedTeam,
} from '../vesting/helpers';
import { PollStatus } from './types-poll';
import { ocdDiv, OnChainDecimal } from '../../types/on-chain-decimal';

function q(
  initialIndyDist: bigint,
  pollStatus: PollStatus,
  currentTime: bigint,
  treasuryIndyWithdrawnAmt: bigint,
): OnChainDecimal {
  if (pollStatus.yesVotes + pollStatus.noVotes === 0n)
    return { getOnChainInt: 0n };
  else {
    const e =
      treasuryIndyWithdrawnAmt +
      calculateTotalVestedRewards(currentTime) +
      calculateTotalVestedTeam(currentTime) +
      initialIndyDist;

    const q =
      ocdDiv(
        { getOnChainInt: pollStatus.yesVotes },
        { getOnChainInt: BigInt(Math.floor(Math.sqrt(Number(e)))) },
      ).getOnChainInt -
      ocdDiv(
        { getOnChainInt: pollStatus.noVotes },
        {
          getOnChainInt: BigInt(
            Math.floor(
              Math.sqrt(Number(pollStatus.yesVotes + pollStatus.noVotes)),
            ),
          ),
        },
      ).getOnChainInt;

    return { getOnChainInt: BigInt(q) };
  }
}

export function pollPassQuorum(
  initialIndyDist: bigint,
  pollStatus: PollStatus,
  currentTime: bigint,
  minQuorum: bigint,
  treasuryIndyWithdrawnAmt: bigint,
): boolean {
  return (
    pollStatus.yesVotes + pollStatus.noVotes >= minQuorum &&
    q(initialIndyDist, pollStatus, currentTime, treasuryIndyWithdrawnAmt)
      .getOnChainInt > 50_000n
  );
}
