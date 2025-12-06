import { applyParamsToScript, SpendingValidator } from '@lucid-evolution/lucid';
import { castStabilityPoolParams, StabilityPoolParams } from './types';
import {
  fromSystemParamsAsset,
  StabilityPoolParamsSP,
} from '../../types/system-params';
import { _stabilityPoolValidator } from '../../validators/stability-pool-validator';

export const mkStabilityPoolValidator = (
  params: StabilityPoolParams,
): SpendingValidator => {
  return {
    type: 'PlutusV3',
    script: applyParamsToScript(_stabilityPoolValidator.cborHex, [
      castStabilityPoolParams(params),
    ]),
  };
};

export const mkStabilityPoolValidatorFromSP = (
  params: StabilityPoolParamsSP,
): SpendingValidator => {
  return {
    type: 'PlutusV3',
    script: applyParamsToScript(_stabilityPoolValidator.cborHex, [
      castStabilityPoolParams({
        assetSymbol: params.assetSymbol.unCurrencySymbol,
        stabilityPoolToken: fromSystemParamsAsset(params.stabilityPoolToken),
        snapshotEpochToScaleToSumToken: fromSystemParamsAsset(
          params.snapshotEpochToScaleToSumToken,
        ),
        accountToken: fromSystemParamsAsset(params.accountToken),
        cdpToken: fromSystemParamsAsset(params.cdpToken),
        iAssetAuthToken: fromSystemParamsAsset(params.iAssetAuthToken),
        versionRecordToken: fromSystemParamsAsset(params.versionRecordToken),
        collectorValHash: params.collectorValHash,
        govNFT: fromSystemParamsAsset(params.govNFT),
        accountCreateFeeLovelaces: BigInt(params.accountCreateFeeLovelaces),
        accountAdjustmentFeeLovelaces: BigInt(
          params.accountAdjustmentFeeLovelaces,
        ),
        requestCollateralLovelaces: BigInt(params.requestCollateralLovelaces),
      }),
    ]),
  };
};
