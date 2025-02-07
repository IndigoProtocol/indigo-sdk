import {
  Address,
  applyParamsToScript,
  Constr,
  Credential,
  Data,
  fromText,
  LucidEvolution,
  SpendingValidator,
  UTxO,
  validatorToAddress,
  validatorToScriptHash,
} from '@lucid-evolution/lucid';
import { CdpCreatorParams, ScriptReferences } from '../types';
import { _cdpCreatorValidator } from '../scripts/cdp-creator-validator';
import { scriptRef } from '../helpers';

export class CDPCreatorContract {
  static address(params: CdpCreatorParams, lucid: LucidEvolution): Address {
    const network = lucid.config().network;
    if (!network) {
      throw new Error('Network configuration is undefined');
    }
    return validatorToAddress(network, CDPCreatorContract.validator(params));
  }

  static validator(params: CdpCreatorParams): SpendingValidator {
    return {
      type: 'PlutusV2',
      script: applyParamsToScript(_cdpCreatorValidator.cborHex, [
        new Constr(0, [
          new Constr(0, [
            params.cdpCreatorNft[0].unCurrencySymbol,
            fromText(params.cdpCreatorNft[1].unTokenName),
          ]),
          params.cdpAssetCs.unCurrencySymbol,
          new Constr(0, [
            params.cdpAuthTk[0].unCurrencySymbol,
            fromText(params.cdpAuthTk[1].unTokenName),
          ]),
          new Constr(0, [
            params.iAssetAuthTk[0].unCurrencySymbol,
            fromText(params.iAssetAuthTk[1].unTokenName),
          ]),
          new Constr(0, [
            params.versionRecordToken[0].unCurrencySymbol,
            fromText(params.versionRecordToken[1].unTokenName),
          ]),
          params.cdpScriptHash,
          params.collectorValHash,
          BigInt(params.minCollateralInLovelace),
          BigInt(params.biasTime),
        ]),
      ]),
    };
  }

  static validatorHash(
    params: CdpCreatorParams
  ): string {
    return validatorToScriptHash(CDPCreatorContract.validator(params));
  }

  static redeemer(
    hash: Credential,
    mintedAmount: bigint,
    collateralAmount: bigint,
  ): Data {
    if (hash.type !== 'Key') throw new Error('Cannot support script hash.');

    return new Constr<Data>(0, [
      hash.hash,
      BigInt(mintedAmount),
      BigInt(collateralAmount),
    ]);
  }

  static scriptRef(
    params: ScriptReferences,
    lucid: LucidEvolution,
  ): Promise<UTxO> {
    return scriptRef(params.cdpCreatorValidatorRef, lucid);
  }
}
