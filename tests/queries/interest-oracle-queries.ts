import { LucidEvolution, UTxO } from '@lucid-evolution/lucid';
import { AssetClass } from '../../src/types/generic';
import { assetClassToUnit } from '../../src/helpers/value-helpers';
import { InterestOracleDatum, parseInterestOracleDatum } from '../../src';

export async function findInterestOracle(
  lucid: LucidEvolution,
  interestNft: AssetClass,
): Promise<[UTxO, InterestOracleDatum]> {
  const interestUtxo = await lucid.utxoByUnit(assetClassToUnit(interestNft));
  if (!interestUtxo.datum) throw new Error('No interest oracle utxo found');
  return [interestUtxo, parseInterestOracleDatum(interestUtxo.datum)];
}

