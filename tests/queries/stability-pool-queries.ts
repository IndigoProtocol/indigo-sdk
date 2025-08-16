import {
  fromText,
  LucidEvolution,
  Network,
  OutRef,
  ScriptHash,
  UTxO,
} from '@lucid-evolution/lucid';
import { createScriptAddress } from '../../src/helpers/lucid-utils';
import { AssetClass } from '../../src/types/generic';
import { assetClassToUnit } from '../../src/helpers/value-helpers';
import { matchSingle, parseAccountDatum, parseStabilityPoolDatum } from '../../src';

export async function findStabilityPool(
  lucid: LucidEvolution,
  network: Network,
  stabilityPoolHash: ScriptHash,
  stabilityPoolToken: AssetClass,
  asset: string,
): Promise<UTxO> {
  const stakingUtxos = await lucid.utxosAtWithUnit(
    createScriptAddress(network, stabilityPoolHash),
    assetClassToUnit(stabilityPoolToken),
  );

  return matchSingle(
    stakingUtxos.filter((utxo) => {
      if (utxo.datum != null) {
        try {
          const stabilityPoolDatum = parseStabilityPoolDatum(utxo.datum);

          return stabilityPoolDatum.asset == fromText(asset);
        } catch (_) {
          // when incompatible datum
          return false;
        }
      }
    }),
    (res) =>
      new Error('Expected a single Stability Pool UTXO.: ' + JSON.stringify(res)),
  );
}


export async function findStabilityPoolAccount(
  lucid: LucidEvolution,
  network: Network,
  stabilityPoolHash: ScriptHash,
  owner: string,
  asset: string,
): Promise<UTxO> {
  const accountUtxos = await lucid.utxosAt(
    createScriptAddress(network, stabilityPoolHash),
  );

  return matchSingle(
    accountUtxos.filter((utxo) => {
      if (utxo.datum != null) {
        try {
          const accountDatum = parseAccountDatum(utxo.datum);

          return accountDatum.asset == fromText(asset) && accountDatum.owner == owner;
        } catch (_) {
          // when incompatible datum
          return false;
        }
      }
    }),
    (res) =>
      new Error('Expected a single Account UTXO.: ' + JSON.stringify(res)),
  );
}