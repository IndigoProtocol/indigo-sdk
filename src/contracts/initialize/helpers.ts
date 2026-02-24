import { LucidEvolution, TxBuilder } from '@lucid-evolution/lucid';

/** Token names used during protocol initialization. */
export const INDY_TOKEN_NAME = 'INDY';
export const DAO_TOKEN_NAME = 'DAO';
export const GOV_NFT_TOKEN_NAME = 'GOV_NFT';
export const POLL_MANAGER_TOKEN_NAME = 'POLL_MANAGER';
export const UPGRADE_TOKEN_NAME = 'UPGRADE';
export const IASSET_TOKEN_NAME = 'IASSET';
export const STABILITY_POOL_TOKEN_NAME = 'STABILITY_POOL';
export const VERSION_RECORD_TOKEN_NAME = 'VERSION_RECORD';
export const CDP_CREATOR_TOKEN_NAME = 'CDP_CREATOR';
export const CDP_TOKEN_NAME = 'CDP';
export const STAKING_MANAGER_TOKEN_NAME = 'STAKING_MANAGER';
export const STAKING_TOKEN_NAME = 'STAKING_POSITION';
export const SNAPSHOT_EPOCH_TO_SCALE_TO_SUM_TOKEN_NAME =
  'SNAPSHOT_EPOCH_TO_SCALE_TO_SUM';
export const ACCOUNT_TOKEN_NAME = 'SP_ACCOUNT';

export const TOTAL_INDY_SUPPLY = 35000000000000n;
export const TREASURY_INDY_AMOUNT = 100_000n;
export const NUM_CDP_CREATORS = 2n;
export const NUM_COLLECTORS = 2n;

/**
 * Script hash of a validator that always fails; used to create script reference UTxOs.
 */
export const ALWAYS_FAIL_VALIDATOR_HASH =
  'ea84d625650d066e1645e3e81d9c70a73f9ed837bd96dc49850ae744';

/**
 * Complete, sign, submit a TxBuilder and wait for confirmation.
 * Used by initialize transactions so the contract does not depend on test helpers.
 */
export async function submitAndAwaitTx(
  lucid: LucidEvolution,
  tx: TxBuilder,
): Promise<string> {
  const txHash = await tx
    .complete()
    .then((t) => t.sign.withWallet().complete())
    .then((t) => t.submit());
  await lucid.awaitTx(txHash);
  return txHash;
}
