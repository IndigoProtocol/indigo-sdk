import {
  applyParamsToScript,
  Constr,
  fromText,
  SpendingValidator,
} from '@lucid-evolution/lucid';
import { StakingParamsSP } from '../../types/system-params';
import { _stakingValidator } from '../../validators/staking-validator';

export const mkStakingValidatorFromSP = (
  params: StakingParamsSP,
): SpendingValidator => {
  return {
    type: 'PlutusV2',
    script: applyParamsToScript(_stakingValidator.cborHex, [
      new Constr(0, [
        new Constr(0, [
          params.stakingManagerNFT[0].unCurrencySymbol,
          fromText(params.stakingManagerNFT[1].unTokenName),
        ]),
        new Constr(0, [
          params.stakingToken[0].unCurrencySymbol,
          fromText(params.stakingToken[1].unTokenName),
        ]),
        new Constr(0, [
          params.indyToken[0].unCurrencySymbol,
          fromText(params.indyToken[1].unTokenName),
        ]),
        new Constr(0, [
          params.pollToken[0].unCurrencySymbol,
          fromText(params.pollToken[1].unTokenName),
        ]),
        new Constr(0, [
          params.versionRecordToken[0].unCurrencySymbol,
          fromText(params.versionRecordToken[1].unTokenName),
        ]),
        params.collectorValHash,
      ]),
    ]),
  };
};
