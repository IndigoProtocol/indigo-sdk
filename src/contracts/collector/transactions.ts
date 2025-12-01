import {
  Constr,
  Data,
  LucidEvolution,
  OutRef,
  TxBuilder,
  UTxO,
} from '@lucid-evolution/lucid';
import { ScriptReferences, SystemParams } from '../../types/system-params';
import { scriptRef } from '../../utils/lucid-utils';
import { matchSingle } from '../../utils/utils';

export class CollectorContract {
  static async feeTx(
    fee: bigint,
    lucid: LucidEvolution,
    params: SystemParams,
    tx: TxBuilder,
    collectorOref: OutRef,
  ): Promise<void> {
    const collectorUtxo: UTxO = matchSingle(
      await lucid.utxosByOutRef([collectorOref]),
      (_) => new Error('Expected a single collector UTXO'),
    );

    const collectorScriptRefUtxo = await CollectorContract.scriptRef(
      params.scriptReferences,
      lucid,
    );

    tx.collectFrom([collectorUtxo], Data.to(new Constr(0, [])))
      .pay.ToContract(
        collectorUtxo.address,
        { kind: 'inline', value: Data.to(new Constr(0, [])) },
        {
          ...collectorUtxo.assets,
          lovelace: collectorUtxo.assets.lovelace + fee,
        },
      )
      .readFrom([collectorScriptRefUtxo]);
  }

  static async scriptRef(
    params: ScriptReferences,
    lucid: LucidEvolution,
  ): Promise<UTxO> {
    return scriptRef(params.collectorValidatorRef, lucid);
  }
}
