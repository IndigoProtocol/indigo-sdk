import { LucidEvolution, UTxO } from '@lucid-evolution/lucid';
import { AssetClass, createScriptAddress, getRandomElement } from '../../src';
import { assetClassToUnit } from '../../src/helpers/value-helpers';
import { option as O, function as F } from 'fp-ts';

export async function findAllCdpCreators(
  lucid: LucidEvolution,
  cdpCreatorScriptHash: string,
  cdpCreatorNft: AssetClass,
): Promise<UTxO[]> {
  return lucid.utxosAtWithUnit(
    createScriptAddress(lucid.config().network!, cdpCreatorScriptHash),
    assetClassToUnit(cdpCreatorNft),
  );
}

export async function findRandomCdpCreator(
  lucid: LucidEvolution,
  cdpCreatorScriptHash: string,
  cdpCreatorNft: AssetClass,
): Promise<UTxO> {
  const cdpCreatorUtxos = await findAllCdpCreators(
    lucid,
    cdpCreatorScriptHash,
    cdpCreatorNft,
  );

  return F.pipe(
    O.fromNullable(getRandomElement(cdpCreatorUtxos)),
    O.match(() => {
      throw new Error('Expected some cdp creator UTXOs.');
    }, F.identity),
  );
}
