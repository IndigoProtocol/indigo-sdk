import {
  applyParamsToScript,
  Constr,
  fromText,
  SpendingValidator,
} from '@lucid-evolution/lucid';
import { CollectorParamsSP } from '../../types/system-params';
import { _collectorValidator } from '../../validators-export/collector-validator';

export const mkCollectorValidatorFromSP = (
  params: CollectorParamsSP,
): SpendingValidator => {
  return {
    type: 'PlutusV2',
    script: applyParamsToScript(_collectorValidator.cborHex, [
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
          params.versionRecordToken[0].unCurrencySymbol,
          fromText(params.versionRecordToken[1].unTokenName),
        ]),
      ]),
    ]),
  };
};
