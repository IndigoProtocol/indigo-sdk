import {
  fromText,
  LucidEvolution,
  ScriptHash,
  toHex,
  UTxO,
} from '@lucid-evolution/lucid';
import { createScriptAddress } from '../../src/utils/lucid-utils';
import { AssetClass } from '../../src/types/generic';
import { assetClassToUnit } from '../../src/utils/value-helpers';
import { matchSingle } from '../../src';
import {
  parseAccountDatum,
  parseStabilityPoolDatum,
} from '../../src/contracts/stability-pool/types-new';

export async function findStabilityPool(
  lucid: LucidEvolution,
  stabilityPoolHash: ScriptHash,
  stabilityPoolToken: AssetClass,
  asset: string,
): Promise<UTxO> {
  const stakingUtxos = await lucid.utxosAtWithUnit(
    createScriptAddress(lucid.config().network!, stabilityPoolHash),
    assetClassToUnit(stabilityPoolToken),
  );

  return matchSingle(
    stakingUtxos.filter((utxo) => {
      if (utxo.datum != null) {
        try {
          const stabilityPoolDatum = parseStabilityPoolDatum(utxo.datum);

          return toHex(stabilityPoolDatum.asset) == fromText(asset);
        } catch (_) {
          // when incompatible datum
          return false;
        }
      }
    }),
    (res) =>
      new Error(
        'Expected a single Stability Pool UTXO.: ' + JSON.stringify(res),
      ),
  );
}

export async function findStabilityPoolAccount(
  lucid: LucidEvolution,
  stabilityPoolHash: ScriptHash,
  owner: string,
  asset: string,
): Promise<UTxO> {
  const accountUtxos = await lucid.utxosAt(
    createScriptAddress(lucid.config().network!, stabilityPoolHash),
  );

  return matchSingle(
    accountUtxos.filter((utxo) => {
      if (utxo.datum != null) {
        try {
          const accountDatum = parseAccountDatum(utxo.datum);

          return (
            toHex(accountDatum.asset) == fromText(asset) &&
            toHex(accountDatum.owner) == owner
          );
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
