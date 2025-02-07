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
import { TreasuryParams, ScriptReferences, SystemParams } from '../types';
import { _treasuryValidator } from '../scripts/treasury-validator';

export class TreasuryContract {
  static async feeTx(
    fee: bigint,
    lucid: LucidEvolution,
    params: SystemParams,
    tx: TxBuilder,
    treasuryRef?: OutRef,
  ): Promise<void> {
    const treasuryUtxo: UTxO = treasuryRef
      ? getRandomElement(await lucid.utxosByOutRef([treasuryRef]))
      : getRandomElement(await lucid.utxosAt(
        TreasuryContract.address(params.treasuryParams, lucid),
        ));

    const treasuryScriptRefUtxo = await TreasuryContract.scriptRef(
      params.scriptReferences,
      lucid,
    );

    console.log(TreasuryContract.address(params.treasuryParams, lucid), treasuryUtxo, treasuryUtxo.assets['lovelace'] + fee)

    tx.collectFrom([treasuryUtxo], Data.to(new Constr(4, [])))
      .pay.ToContract(
        treasuryUtxo.address,
        { kind: 'inline', value: treasuryUtxo.datum || '' },
        {
          ...treasuryUtxo.assets,
          lovelace: treasuryUtxo.assets['lovelace'] + fee,
        },
      )
      .readFrom([treasuryScriptRefUtxo]);
  }

  // treasury Validator
  static validator(params: TreasuryParams): SpendingValidator {
    return {
      type: 'PlutusV2',
      script: applyParamsToScript(_treasuryValidator.cborHex, [
        new Constr(0, [
          new Constr(0, [
            params.upgradeToken[0].unCurrencySymbol,
            fromText(params.upgradeToken[1].unTokenName),
          ]),
          new Constr(0, [
            params.versionRecordToken[0].unCurrencySymbol,
            fromText(params.versionRecordToken[1].unTokenName),
          ]),
          params.treasuryUtxosStakeCredential ?
            new Constr(0, [
              new Constr(0, [
              new Constr(1, [
                params.treasuryUtxosStakeCredential.contents.contents,
              ])
            ])
            ]) : new Constr(1, []),
        ]),
      ]),
    };
  }

  static validatorHash(params: TreasuryParams): string {
    return validatorToScriptHash(TreasuryContract.validator(params));
  }

  static address(params: TreasuryParams, lucid: LucidEvolution): Address {
    const network = lucid.config().network;
    if (!network) {
      throw new Error('Network configuration is undefined');
    }
    return validatorToAddress(network, TreasuryContract.validator(params), params.treasuryUtxosStakeCredential ? { type: 'Script', hash: params.treasuryUtxosStakeCredential.contents.contents} : undefined);
  }

  static async scriptRef(
    params: ScriptReferences,
    lucid: LucidEvolution,
  ): Promise<UTxO> {
    return scriptRef(params.treasuryValidatorRef, lucid);
  }
}
