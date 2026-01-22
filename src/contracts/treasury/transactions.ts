import {
  addAssets,
  Data,
  LucidEvolution,
  OutRef,
  TxBuilder,
} from '@lucid-evolution/lucid';
import {
  fromSysParamsScriptCredential,
  fromSystemParamsScriptRef,
  SystemParams,
} from '../../types/system-params';
import { matchSingle } from '../../utils/utils';
import { mkLovelacesOf } from '../../utils/value-helpers';
import { serialiseTreasuryRedeemer } from './types';
import { createScriptAddress } from '../../utils/lucid-utils';

export async function treasuryFeeTx(
  fee: bigint,
  lucid: LucidEvolution,
  sysParams: SystemParams,
  tx: TxBuilder,
  treasuryOref: OutRef,
): Promise<void> {
  if (fee <= 0n) return;

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

  const stakeCredential = sysParams.treasuryParams.treasuryUtxosStakeCredential
    ? fromSysParamsScriptCredential(
        sysParams.treasuryParams.treasuryUtxosStakeCredential,
      )
    : undefined;

  tx.readFrom([treasuryRefScriptUtxo])
    .collectFrom([treasuryUtxo], serialiseTreasuryRedeemer('CollectAda'))
    .pay.ToContract(
      createScriptAddress(
        lucid.config().network!,
        sysParams.validatorHashes.treasuryHash,
        stakeCredential,
      ),
      { kind: 'inline', value: Data.void() },
      addAssets(treasuryUtxo.assets, mkLovelacesOf(fee)),
    );
}
