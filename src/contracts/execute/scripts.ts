import {
  applyParamsToScript,
  applySingleCborEncoding,
  SpendingValidator,
} from '@lucid-evolution/lucid';
import { castExecuteParams, ExecuteParams } from './types';
import {
  ExecuteParamsSP,
  fromSystemParamsAsset,
} from '../../types/system-params';
import { _executeValidator } from '../../validators/execute-validator';

export const mkExecuteValidator = (
  params: ExecuteParams,
): SpendingValidator => {
  return {
    type: 'PlutusV3',
    script: applySingleCborEncoding(
      applyParamsToScript(_executeValidator.cborHex, [
        castExecuteParams(params),
      ]),
    ),
  };
};

export const mkExecuteValidatorFromSP = (
  params: ExecuteParamsSP,
): SpendingValidator => {
  return {
    type: 'PlutusV3',
    script: applySingleCborEncoding(
      applyParamsToScript(_executeValidator.cborHex, [
        castExecuteParams({
          govNFT: fromSystemParamsAsset(params.govNFT),
          upgradeToken: fromSystemParamsAsset(params.upgradeToken),
          iAssetToken: fromSystemParamsAsset(params.iAssetToken),
          stabilityPoolToken: fromSystemParamsAsset(params.stabilityPoolToken),
          versionRecordToken: fromSystemParamsAsset(params.versionRecordToken),
          cdpValHash: params.cdpValHash,
          sPoolValHash: params.sPoolValHash,
          versionRegistryValHash: params.versionRegistryValHash,
          treasuryValHash: params.treasuryValHash,
          indyAsset: fromSystemParamsAsset(params.indyAsset),
        } as ExecuteParams),
      ]),
    ),
  };
};
