import {
  addAssets,
  Constr,
  Data,
  LucidEvolution,
  OutRef,
  TxBuilder,
  UTxO,
} from '@lucid-evolution/lucid';
import {
  fromSystemParamsScriptRef,
  ScriptReferences,
  SystemParams,
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

  static async scriptRef(
    params: ScriptReferences,
    lucid: LucidEvolution,
  ): Promise<UTxO> {
    return scriptRef(params.treasuryValidatorRef, lucid);
  }
}
