import { applyParamsToScript, SpendingValidator } from '@lucid-evolution/lucid';
import { castGovParams, GovParams } from './types';
import { GovParamsSP, fromSystemParamsAsset } from '../../types/system-params';
import { _governanceValidator } from '../../validators/governance-validator';

export const mkGovValidator = (params: GovParams): SpendingValidator => {
  return {
    type: 'PlutusV2',
    script: applyParamsToScript(_governanceValidator.cborHex, [
      castGovParams(params),
    ]),
  };
};

export const mkGovValidatorFromSP = (
  params: GovParamsSP,
): SpendingValidator => {
  return {
    type: 'PlutusV2',
    script: applyParamsToScript(_governanceValidator.cborHex, [
      castGovParams({
        gBiasTime: BigInt(params.gBiasTime),
        govNFT: fromSystemParamsAsset(params.govNFT),
        pollToken: fromSystemParamsAsset(params.pollToken),
        upgradeToken: fromSystemParamsAsset(params.upgradeToken),
        indyAsset: fromSystemParamsAsset(params.indyAsset),
        versionRecordToken: fromSystemParamsAsset(params.versionRecordToken),
        pollManagerValHash: params.pollManagerValHash,
        daoIdentityToken: fromSystemParamsAsset(params.daoIdentityToken),
        iAssetAuthToken: fromSystemParamsAsset(params.iAssetAuthToken),
      }),
    ]),
  };
};
