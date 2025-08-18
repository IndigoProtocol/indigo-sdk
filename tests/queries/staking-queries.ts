import {
  LucidEvolution,
  Network,
  OutRef,
  ScriptHash,
} from '@lucid-evolution/lucid';
import { createScriptAddress } from '../../src/helpers/lucid-utils';
import { AssetClass } from '../../src/types/generic';
import { assetClassToUnit } from '../../src/helpers/value-helpers';
import { matchSingle, parseIAssetDatum } from '../../src';
import { parseStakingPositionDatum } from '../../src/types/indigo/staking';

export async function findStakingPosition(
  lucid: LucidEvolution,
  network: Network,
  stakingScriptHash: ScriptHash,
  stakingPositionNft: AssetClass,
  owner: string,
): Promise<OutRef> {
  const stakingUtxos = await lucid.utxosAtWithUnit(
    createScriptAddress(network, stakingScriptHash),
    assetClassToUnit(stakingPositionNft),
  );

  return matchSingle(
    stakingUtxos.filter((utxo) => {
      if (utxo.datum != null) {
        try {
          const stakingDatum = parseStakingPositionDatum(utxo.datum);

          return stakingDatum.owner == owner;
        } catch (_) {
          // when incompatible datum
          return false;
        }
      }
    }),
    (res) =>
      new Error(
        'Expected a single Staking Position UTXO.: ' + JSON.stringify(res),
      ),
  );
}
