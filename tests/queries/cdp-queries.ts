import {
  Credential,
  fromText,
  LucidEvolution,
  ScriptHash,
  UTxO,
} from '@lucid-evolution/lucid';
import {
  AssetClass,
  CDPContent,
  createScriptAddress,
  getRandomElement,
  matchSingle,
  parseCdpDatum,
} from '../../src';
import { assetClassToUnit } from '../../src/helpers/value-helpers';
import { option as O, array as A, function as F } from 'fp-ts';

export async function findCdp(
  lucid: LucidEvolution,
  cdpScriptHash: ScriptHash,
  cdpNft: AssetClass,
  ownerPkh: string,
  stakeCred?: Credential,
): Promise<{ utxo: UTxO; datum: CDPContent }> {
  const cdpUtxos = await lucid.utxosAtWithUnit(
    createScriptAddress(lucid.config().network!, cdpScriptHash, stakeCred),
    assetClassToUnit(cdpNft),
  );

  return matchSingle(
    F.pipe(
      cdpUtxos.map((utxo) =>
        F.pipe(
          O.fromNullable(utxo.datum),
          O.flatMap(parseCdpDatum),
          O.flatMap((datum) => {
            if (datum.cdpOwner === ownerPkh) {
              return O.some({ utxo, datum: datum });
            } else {
              return O.none;
            }
          }),
        ),
      ),
      A.compact,
    ),
    (res) => new Error('Expected a single CDP UTXO.: ' + JSON.stringify(res)),
  );
}

export async function findFrozenCDPs(
  lucid: LucidEvolution,
  cdpScriptHash: ScriptHash,
  cdpNft: AssetClass,
  assetAscii: string,
): Promise<{ utxo: UTxO; datum: CDPContent }[]> {
  const cdpUtxos = await lucid.utxosAtWithUnit(
    createScriptAddress(lucid.config().network!, cdpScriptHash),
    assetClassToUnit(cdpNft),
  );

  return F.pipe(
    cdpUtxos.map((utxo) =>
      F.pipe(
        O.fromNullable(utxo.datum),
        O.flatMap(parseCdpDatum),
        O.flatMap((datum) => {
          if (datum.cdpOwner == null && datum.iasset === fromText(assetAscii)) {
            return O.some({ utxo, datum: datum });
          } else {
            return O.none;
          }
        }),
      ),
    ),
    A.compact,
  );
}

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
