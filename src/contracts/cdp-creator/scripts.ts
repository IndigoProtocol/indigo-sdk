import { applyParamsToScript, SpendingValidator } from '@lucid-evolution/lucid';
import { castCDPCreatorParams, CDPCreatorParams } from './types';
import {
  CDPCreatorParamsSP,
  fromSystemParamsAsset,
} from '../../types/system-params';
import { _cdpCreatorValidator } from '../../validators/cdp-creator-validator';

export const mkCDPCreatorValidator = (
  params: CDPCreatorParams,
): SpendingValidator => {
  return {
    type: 'PlutusV2',
    script: applyParamsToScript(_cdpCreatorValidator.cborHex, [
      castCDPCreatorParams(params),
    ]),
  };
};

export const mkCDPCreatorValidatorFromSP = (
  params: CDPCreatorParamsSP,
): SpendingValidator => {
  return {
    type: 'PlutusV2',
    script: applyParamsToScript(_cdpCreatorValidator.cborHex, [
      castCDPCreatorParams({
        cdpCreatorNft: fromSystemParamsAsset(params.cdpCreatorNft),
        cdpAssetCs: params.cdpAssetCs.unCurrencySymbol,
        cdpAuthTk: fromSystemParamsAsset(params.cdpAuthTk),
        iAssetAuthTk: fromSystemParamsAsset(params.iAssetAuthTk),
        versionRecordToken: fromSystemParamsAsset(params.versionRecordToken),
        cdpScriptHash: params.cdpScriptHash,
        collectorValHash: params.collectorValHash,
        minCollateralInLovelace: BigInt(params.minCollateralInLovelace),
        biasTime: BigInt(params.biasTime),
      }),
    ]),
  };
};
