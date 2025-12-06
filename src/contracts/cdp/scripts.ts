import { applyParamsToScript, SpendingValidator } from '@lucid-evolution/lucid';
import { CdpParamsSP, fromSystemParamsAsset } from '../../types/system-params';
import { castCdpParams } from './types';
import { _cdpValidator } from '../../validators/cdp-validator';

export const mkCdpValidatorFromSP = (
  params: CdpParamsSP,
): SpendingValidator => {
  return {
    type: 'PlutusV3',
    script: applyParamsToScript(_cdpValidator.cborHex, [
      castCdpParams({
        cdp_auth_token: fromSystemParamsAsset(params.cdpAuthToken),
        cdp_asset_symbol: params.cdpAssetSymbol.unCurrencySymbol,
        iasset_auth_token: fromSystemParamsAsset(params.iAssetAuthToken),
        stability_pool_auth_token: fromSystemParamsAsset(
          params.stabilityPoolAuthToken,
        ),
        version_record_token: fromSystemParamsAsset(params.versionRecordToken),
        upgrade_token: fromSystemParamsAsset(params.upgradeToken),
        collector_val_hash: params.collectorValHash,
        sp_val_hash: params.spValHash,
        gov_nft: fromSystemParamsAsset(params.govNFT),
        min_collateral_in_lovelace: BigInt(params.minCollateralInLovelace),
        partial_redemption_extra_fee_lovelace: BigInt(
          params.partialRedemptionExtraFeeLovelace,
        ),
        bias_time: BigInt(params.biasTime),
        treasury_val_hash: params.treasuryValHash,
      }),
    ]),
  };
};
