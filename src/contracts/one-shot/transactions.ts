import {
  addAssets,
  Assets,
  Constr,
  Data,
  LucidEvolution,
  mintingPolicyToId,
  PolicyId,
  toUnit,
  TxBuilder,
} from '@lucid-evolution/lucid';
import { OneShotParams } from './types';
import { matchSingle } from '../../utils/utils';
import { mkOneShotPolicy } from './scripts';
import { reduce } from 'fp-ts/lib/Array';

export async function oneShotMintTx(
  lucid: LucidEvolution,
  params: OneShotParams,
): Promise<[TxBuilder, PolicyId]> {
  const oneShotPolicy = mkOneShotPolicy(params);
  const policyId = mintingPolicyToId(oneShotPolicy);

  const refUtxo = matchSingle(
    await lucid.utxosByOutRef([
      {
        txHash: params.referenceOutRef.txHash,
        outputIndex: Number(params.referenceOutRef.outputIdx),
      },
    ]),
    (_) => {
      throw new Error('Cannot find the reference UTXO for one-shot.');
    },
  );

  return [
    lucid
      .newTx()
      .collectFrom([refUtxo])
      .mintAssets(
        reduce<{ tokenName: string; amount: bigint }, Assets>(
          {},
          (acc, entry) =>
            addAssets(acc, {
              [toUnit(policyId, entry.tokenName)]: entry.amount,
            }),
        )(params.mintAmounts),
        Data.to(new Constr(0, [])),
      )
      .attach.MintingPolicy(oneShotPolicy),
    policyId,
  ];
}

export async function runOneShotMintTx(
  lucid: LucidEvolution,
  params: OneShotParams,
): Promise<PolicyId> {
  const [tx, policyId] = await oneShotMintTx(lucid, params);
  const txHash = await tx
    .complete()
    .then((tx) => tx.sign.withWallet().complete())
    .then((tx) => tx.submit());

  await lucid.awaitTx(txHash);
  return policyId;
}
