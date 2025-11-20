import { LucidEvolution, UTxO } from '@lucid-evolution/lucid';
import { AssetClass } from '../../src/types/generic';
import { assetClassToUnit } from '../../src/helpers/value-helpers';

export async function findInterestOracle(
  lucid: LucidEvolution,
  interestNft: AssetClass,
): Promise<UTxO> {
  return lucid.utxoByUnit(assetClassToUnit(interestNft));
}
