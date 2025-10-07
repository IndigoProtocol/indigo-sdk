import {
  LucidEvolution,
  Network,
  OutRef,
  ScriptHash,
  toUnit,
} from '@lucid-evolution/lucid';
import { createScriptAddress, matchSingle, OracleAssetNft } from '../../src';

export async function findPriceOracle(
  lucid: LucidEvolution,
  network: Network,
  oracleScriptHash: ScriptHash,
  oracleNft: OracleAssetNft,
): Promise<OutRef> {
  return matchSingle(
    await lucid.utxosAtWithUnit(
      createScriptAddress(network, oracleScriptHash),
      toUnit(oracleNft.oracleNft.currencySymbol, oracleNft.oracleNft.tokenName),
    ),
    (res) =>
      new Error('Expected a single Oracle UTXO.: ' + JSON.stringify(res)),
  );
}
