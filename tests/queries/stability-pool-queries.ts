import {
  LucidEvolution,
  Network,
  OutRef,
  ScriptHash,
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
): Promise<OutRef> {
  const stakingUtxos = await lucid.utxosAtWithUnit(
    createScriptAddress(network, stabilityPoolHash),
    assetClassToUnit(stabilityPoolToken),
  );

  return matchSingle(
    stakingUtxos.filter((utxo) => {
      if (utxo.datum != null) {
        try {
          const stabilityPoolDatum = parseStabilityPoolDatum(utxo.datum);

          return stabilityPoolDatum.asset == asset;
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
): Promise<OutRef> {
  const accountUtxos = await lucid.utxosAt(
    createScriptAddress(network, stabilityPoolHash),
  );

  console.log(accountUtxos);

  return matchSingle(
    accountUtxos.filter((utxo) => {
      if (utxo.datum != null) {
        try {
          const accountDatum = parseAccountDatum(utxo.datum);

          return accountDatum.asset == asset && accountDatum.owner == owner;
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