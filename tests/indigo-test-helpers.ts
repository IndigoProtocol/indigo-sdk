import {
  Assets,
  fromText,
  LucidEvolution,
  Network,
  ScriptHash,
  toUnit,
} from '@lucid-evolution/lucid';
import { createScriptAddress } from '../src/helpers/lucid-utils';
import {
  AssetClass,
  IAssetContent,
  runOneShotMintTx,
  serialiseIAssetDatum,
} from '../src';

/**
 * TODO: the NFT has to be minted using the auth policy based on execute NFT.
 * This is just a mocked setup for test purposes.
 *
 * @returns NFT of the iAsset.
 */
export async function runCreateIAsset(
  lucid: LucidEvolution,
  network: Network,
  cdpScriptHash: ScriptHash,
  iasset: IAssetContent,
): Promise<AssetClass> {
  const nftTokenName = fromText('IASSET_NFT');
  const utxos = await lucid.wallet().getUtxos();
  const nftPolicyId = await runOneShotMintTx(lucid, {
    referenceOutRef: {
      txHash: utxos[0].txHash,
      outputIdx: BigInt(utxos[0].outputIndex),
    },
    mintAmounts: [{ tokenName: nftTokenName, amount: 1n }],
  });

  const nftValue: Assets = { [toUnit(nftPolicyId, nftTokenName)]: 1n };

  const txHash = await lucid
    .newTx()
    .pay.ToContract(
      createScriptAddress(network, cdpScriptHash),
      {
        kind: 'inline',
        value: serialiseIAssetDatum(iasset),
      },
      nftValue,
    )
    .complete()
    .then((tx) => tx.sign.withWallet().complete())
    .then((tx) => tx.submit());

  await lucid.awaitTx(txHash);

  return {
    currencySymbol: nftPolicyId,
    tokenName: nftTokenName,
  };
}
