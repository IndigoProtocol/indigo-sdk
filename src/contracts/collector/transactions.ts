import {
  Constr,
  Data,
  LucidEvolution,
  OutRef,
  TxBuilder,
  UTxO,
} from '@lucid-evolution/lucid';
import {
  fromSystemParamsScriptRef,
  SystemParams,
} from '../../types/system-params';
import { matchSingle } from '../../utils/utils';

export async function collectorFeeTx(
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

  const collectorRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(params.scriptReferences.collectorValidatorRef),
    ]),
    (_) => new Error('Expected a single collector Ref Script UTXO'),
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
    .readFrom([collectorRefScriptUtxo]);
}
