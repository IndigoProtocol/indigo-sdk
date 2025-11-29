import { LucidEvolution, UTxO } from '@lucid-evolution/lucid';
import { OracleAssetNft } from '../../src';
import { assetClassToUnit } from '../../src/utils/value-helpers';

export async function findPriceOracle(
  lucid: LucidEvolution,
  oracleNft: OracleAssetNft,
): Promise<UTxO> {
  return lucid.utxoByUnit(assetClassToUnit(oracleNft.oracleNft));
}
