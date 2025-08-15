import {
  LucidEvolution,
  Network,
  OutRef,
  SpendingValidator,
  validatorToAddress,
} from '@lucid-evolution/lucid';
import { alwaysFailValidator } from '../scripts/always-fail-validator';

/**
 * Uses an always fail validator for the destination address.
 */
export async function runCreateScriptRefTx(
  lucid: LucidEvolution,
  scriptRefValidator: SpendingValidator,
  network: Network,
): Promise<OutRef> {
  const scriptAddr = validatorToAddress(network, alwaysFailValidator);

  const txHash = await lucid
    .newTx()
    .pay.ToAddressWithData(scriptAddr, undefined, {}, scriptRefValidator)
    .complete()
    .then((tx) => tx.sign.withWallet().complete())
    .then((tx) => tx.submit());

  await lucid.awaitTx(txHash);

  return { txHash: txHash, outputIndex: 0 };
}
