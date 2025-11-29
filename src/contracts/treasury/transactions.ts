import {
  addAssets,
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
import { _treasuryValidator } from './scripts';
import {
  fromSystemParamsScriptRef,
  ScriptReferences,
  SystemParams,
  TreasuryParams,
} from '../../types/system-params';
import { scriptRef } from '../../utils/lucid-utils';
import { matchSingle } from '../../utils/utils';
import { mkLovelacesOf } from '../../utils/value-helpers';

export class TreasuryContract {
  static async feeTx(
    fee: bigint,
    lucid: LucidEvolution,
    sysParams: SystemParams,
    tx: TxBuilder,
    treasuryOref: OutRef,
  ): Promise<void> {
    const treasuryUtxo = matchSingle(
      await lucid.utxosByOutRef([treasuryOref]),
      (_) => new Error('Expected a single treasury UTXO'),
    );

    const treasuryRefScriptUtxo = matchSingle(
      await lucid.utxosByOutRef([
        fromSystemParamsScriptRef(
          sysParams.scriptReferences.treasuryValidatorRef,
        ),
      ]),
      (_) => new Error('Expected a single treasury Ref Script UTXO'),
    );

    tx.readFrom([treasuryRefScriptUtxo])
      .collectFrom([treasuryUtxo], Data.to(new Constr(4, [])))
      .pay.ToContract(
        treasuryUtxo.address,
        { kind: 'inline', value: Data.void() },
        addAssets(treasuryUtxo.assets, mkLovelacesOf(fee)),
      );
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
          params.treasuryUtxosStakeCredential
            ? new Constr(0, [
                new Constr(0, [
                  new Constr(1, [
                    params.treasuryUtxosStakeCredential.contents.contents,
                  ]),
                ]),
              ])
            : new Constr(1, []),
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
    return validatorToAddress(
      network,
      TreasuryContract.validator(params),
      params.treasuryUtxosStakeCredential
        ? {
            type: 'Script',
            hash: params.treasuryUtxosStakeCredential.contents.contents,
          }
        : undefined,
    );
  }

  static async scriptRef(
    params: ScriptReferences,
    lucid: LucidEvolution,
  ): Promise<UTxO> {
    return scriptRef(params.treasuryValidatorRef, lucid);
  }
}
