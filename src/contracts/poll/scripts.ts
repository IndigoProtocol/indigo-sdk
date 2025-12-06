import { applyParamsToScript, SpendingValidator } from '@lucid-evolution/lucid';
import {
  castPollManagerParams,
  PollManagerParams,
} from '../poll/types-poll-manager';
import {
  PollManagerParamsSP,
  PollShardParamsSP,
  fromSystemParamsAsset,
} from '../../types/system-params';
import { castPollShardParams, PollShardParams } from './types-poll-shard';
import { _pollManagerValidator } from '../../validators/poll-manager-validator';
import { _pollShardValidator } from '../../validators/poll-shard-validator';

export const mkPollManagerValidator = (
  params: PollManagerParams,
): SpendingValidator => {
  return {
    type: 'PlutusV3',
    script: applyParamsToScript(_pollManagerValidator.cborHex, [
      castPollManagerParams(params),
    ]),
  };
};

export const mkPollManagerValidatorFromSP = (
  params: PollManagerParamsSP,
): SpendingValidator => {
  return {
    type: 'PlutusV3',
    script: applyParamsToScript(_pollManagerValidator.cborHex, [
      castPollManagerParams({
        govNFT: fromSystemParamsAsset(params.govNFT),
        pollToken: fromSystemParamsAsset(params.pollToken),
        upgradeToken: fromSystemParamsAsset(params.upgradeToken),
        indyAsset: fromSystemParamsAsset(params.indyAsset),
        govExecuteValHash: params.govExecuteValHash,
        pBiasTime: BigInt(params.pBiasTime),
        shardValHash: params.shardsValHash,
        treasuryValHash: params.treasuryValHash,
        initialIndyDistribution: BigInt(params.initialIndyDistribution),
      }),
    ]),
  };
};

export const mkPollShardValidator = (
  params: PollShardParams,
): SpendingValidator => {
  return {
    type: 'PlutusV3',
    script: applyParamsToScript(_pollShardValidator.cborHex, [
      castPollShardParams(params),
    ]),
  };
};

export const mkPollShardValidatorFromSP = (
  params: PollShardParamsSP,
): SpendingValidator => {
  return {
    type: 'PlutusV3',
    script: applyParamsToScript(_pollShardValidator.cborHex, [
      castPollShardParams({
        pollToken: fromSystemParamsAsset(params.pollToken),
        stakingToken: fromSystemParamsAsset(params.stakingToken),
        indyAsset: fromSystemParamsAsset(params.indyAsset),
        stakingValHash: params.stakingValHash,
      }),
    ]),
  };
};
