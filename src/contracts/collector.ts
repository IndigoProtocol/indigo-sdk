import {
  Address,
  applyParamsToScript,
  Constr,
  Data,
  fromText,
  LucidEvolution,
  OutRef,
  SpendingValidator,
  TxBuilder,
  UTxO,
  validatorToAddress,
  validatorToScriptHash,
} from '@lucid-evolution/lucid';
import { getRandomElement, scriptRef } from '../helpers';
import { CollectorParams, ScriptReferences, SystemParams } from '../types';
import { _collectorValidator } from '../scripts/collector-validator';

export class CollectorContract {
  static async feeTx(
    fee: bigint,
    lucid: LucidEvolution,
    params: SystemParams,
    collectorRef?: OutRef,
  ): Promise<TxBuilder> {
    const collectorUtxo = collectorRef
      ? getRandomElement(await lucid.utxosByOutRef([collectorRef]))
      : await lucid.utxosAt(
          CollectorContract.address(params.collectorParams, lucid),
        );

    const collectorAddr = CollectorContract.address(
      params.collectorParams,
      lucid,
    );
    const collectorScriptRefUtxo = await CollectorContract.scriptRef(
      params.scriptReferences,
      lucid,
    );

    return lucid
      .newTx()
      .collectFrom([collectorUtxo], Data.to(new Constr(0, [])))
      .pay.ToContract(
        collectorAddr,
        { kind: 'inline', value: Data.to(new Constr(0, [])) },
        {
          ...collectorUtxo.assets,
          lovelace: collectorUtxo.assets['lovelace'] + fee,
        },
      )
      .readFrom([collectorScriptRefUtxo]);
  }

  // Collector Validator
  static validator(params: CollectorParams): SpendingValidator {
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
  }

  static validatorHash(params: CollectorParams): string {
    return validatorToScriptHash(CollectorContract.validator(params));
  }

  static address(params: CollectorParams, lucid: LucidEvolution): Address {
    const network = lucid.config().network;
    if (!network) {
      throw new Error('Network configuration is undefined');
    }
    return validatorToAddress(network, CollectorContract.validator(params));
  }

  static async scriptRef(
    params: ScriptReferences,
    lucid: LucidEvolution,
  ): Promise<UTxO> {
    return scriptRef(params.collectorValidatorRef, lucid);
  }
}
