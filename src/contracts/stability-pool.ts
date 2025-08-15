import { applyParamsToScript, Constr, fromText, LucidEvolution, TxBuilder, validatorToScriptHash, SpendingValidator, Data, validatorToAddress, Address, UTxO } from '@lucid-evolution/lucid';
import { StabilityPoolDatum } from '../types/indigo/stability-pool';
import { ScriptReferences, StabilityPoolParams, SystemParams } from '../types/system-params';
import { addrDetails, scriptRef } from '../helpers/lucid-utils';
import { _stabilityPoolValidator } from '../scripts/stability-pool-validator';

export class StabilityPoolContract {

  static async createAccount(
    asset: string,
    amount: bigint,
    params: SystemParams,
    lucid: LucidEvolution,
  ): Promise<TxBuilder> {
    const [pkh, _skh] = await addrDetails(lucid);
    const minLovelaces = BigInt(params.stabilityPoolParams.accountCreateFeeLovelaces + params.stabilityPoolParams.requestCollateralLovelaces);
    const datum: StabilityPoolDatum = {
      Account: {
        content: {
          owner: pkh.hash,
          asset: fromText(asset),
          snapshot: {
            productVal: { value: 0n },
            depositVal: { value: 0n },
            sumVal: { value: 0n },
            epoch: 0n,
            scale: 0n,
          },
          request: {
            Create: {}
          },
        }
      }
    }

    return lucid.newTx()
      .pay.ToContract(
        StabilityPoolContract.address(params.stabilityPoolParams, lucid),
        { kind: 'inline', value: StabilityPoolContract.encodeDatum(datum) },
        { 
          lovelace: minLovelaces,
          [params.stabilityPoolParams.assetSymbol.unCurrencySymbol + fromText(asset)]: amount,
        }
      )
      .addSignerKey(pkh.hash);
  }

  static async adjustAccount(
    asset: string,
    amount: bigint,
    accountUtxo: UTxO,
    params: SystemParams,
    lucid: LucidEvolution,
  ): Promise<TxBuilder> {
    const [pkh, _skh] = await addrDetails(lucid);
    const myAddress = await lucid.wallet().address();

    if (!accountUtxo.datum) throw 'Account UTXO datum is invalid';
    const currentAccountDatum = StabilityPoolContract.decodeDatum(accountUtxo.datum);
    if (!('Account' in currentAccountDatum)) throw 'Account UTXO datum is not an account';
    if (currentAccountDatum.Account.content.owner !== myAddress) throw 'Account UTXO datum is not owned by the current address';
    if (currentAccountDatum.Account.content.asset !== fromText(asset)) throw 'Account UTXO datum is not for the specified asset';



    const datum: StabilityPoolDatum = {
      Account: {
        content: {
          owner: pkh.hash,
          asset: fromText(asset),
          snapshot: {
            productVal: { value: 0n },
            depositVal: { value: 0n },
            sumVal: { value: 0n },
            epoch: 0n,
            scale: 0n,
          },
          request: {
            Create: {}
          },
        }
      }
    }

    return lucid.newTx()
      .pay.ToContract(
        StabilityPoolContract.address(params.stabilityPoolParams, lucid),
        { kind: 'inline', value: StabilityPoolContract.encodeDatum(datum) },
        { 
          lovelace: accountUtxo.assets.lovelace,
          [params.stabilityPoolParams.assetSymbol.unCurrencySymbol + fromText(asset)]: amount,
        }
      )
      .addSignerKey(pkh.hash);
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

  static address(params: StabilityPoolParams, lucid: LucidEvolution): Address {
    const network = lucid.config().network;
    if (!network) {
      throw new Error('Network configuration is undefined');
    }
    return validatorToAddress(network, StabilityPoolContract.validator(params));
  }

  static async scriptRef(
    params: ScriptReferences,
    lucid: LucidEvolution,
  ): Promise<UTxO> {
    return scriptRef(params.stabilityPoolValidatorRef, lucid);
  }

  static async stabilityPoolTokenScriptRef(
    params: ScriptReferences,
    lucid: LucidEvolution,
  ): Promise<UTxO> {
    return scriptRef(params.authTokenPolicies.stabilityPoolTokenRef, lucid);
  }
}
