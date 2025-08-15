import { applyParamsToScript, Constr, fromText, LucidEvolution, TxBuilder, validatorToScriptHash, SpendingValidator, Data } from '@lucid-evolution/lucid';
import { StabilityPoolDatum } from '../types/indigo/stability-pool';
import { StabilityPoolParams, SystemParams } from '../types/system-params';
import { addrDetails } from '../helpers/lucid-utils';
import { _stabilityPoolValidator } from '../scripts/stability-pool-validator';

export class StabilityPoolContract {

  static async createAccount(
    asset: string,
    amount: bigint,
    params: SystemParams,
    lucid: LucidEvolution,
  ): Promise<TxBuilder> {
    const [pkh, skh] = await addrDetails(lucid);

    throw 'Not implemented';
  }

  static decodeDatum(datum: string): StabilityPoolDatum {
    return Data.from(datum, StabilityPoolDatum);
  }

  static encodeDatum(datum: StabilityPoolDatum): string {
    return Data.to(datum, StabilityPoolDatum);
  }

  static validator(params: StabilityPoolParams): SpendingValidator {
    return {
      type: _stabilityPoolValidator.type,
      script: applyParamsToScript(_stabilityPoolValidator.cborHex, [
        new Constr(0, [
          params.assetSymbol.unCurrencySymbol,
          new Constr(0, [
            params.stabilityPoolToken[0].unCurrencySymbol,
            fromText(params.stabilityPoolToken[1].unTokenName),
          ]),
          new Constr(0, [
            params.snapshotEpochToScaleToSumToken[0].unCurrencySymbol,
            fromText(params.snapshotEpochToScaleToSumToken[1].unTokenName),
          ]),
          new Constr(0, [
            params.accountToken[0].unCurrencySymbol,
            fromText(params.accountToken[1].unTokenName),
          ]),
          new Constr(0, [
            params.cdpToken[0].unCurrencySymbol,
            fromText(params.cdpToken[1].unTokenName),
          ]),
          new Constr(0, [
            params.iAssetAuthToken[0].unCurrencySymbol,
            fromText(params.iAssetAuthToken[1].unTokenName),
          ]),
          new Constr(0, [
            params.versionRecordToken[0].unCurrencySymbol,
            fromText(params.versionRecordToken[1].unTokenName),
          ]),
          params.collectorValHash,
          new Constr(0, [
            params.govNFT[0].unCurrencySymbol,
            fromText(params.govNFT[1].unTokenName),
          ]),
          BigInt(params.accountCreateFeeLovelaces),
          BigInt(params.accountAdjustmentFeeLovelaces),
          BigInt(params.requestCollateralLovelaces)
        ]),
      ]),
    };
  }

  static validatorHash(params: StabilityPoolParams): string {
    return validatorToScriptHash(StabilityPoolContract.validator(params));
  }
}
