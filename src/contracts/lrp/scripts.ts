import { applyParamsToScript, SpendingValidator } from '@lucid-evolution/lucid';
import { castLrpParams, LRPParams } from './types';
import { fromSystemParamsAsset, LrpParamsSP } from '../../types/system-params';
import { _lrpValidator } from '../../validators/lrp-validator';

export const mkLrpValidator = (params: LRPParams): SpendingValidator => {
  return {
    type: 'PlutusV3',
    script: applyParamsToScript(_lrpValidator.cborHex, [castLrpParams(params)]),
  };
};

export const mkLrpValidatorFromSP = (
  params: LrpParamsSP,
): SpendingValidator => {
  return {
    type: 'PlutusV3',
    script: applyParamsToScript(_lrpValidator.cborHex, [
      castLrpParams({
        versionRecordToken: fromSystemParamsAsset(params.versionRecordToken),
        iassetNft: fromSystemParamsAsset(params.iassetNft),
        minRedemptionLovelacesAmt: BigInt(params.minRedemptionLovelacesAmt),
        iassetPolicyId: params.iassetPolicyId.unCurrencySymbol,
      }),
    ]),
  };
};
