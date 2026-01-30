import { Data, Datum, UTxO } from '@lucid-evolution/lucid';
import { AssetClassSchema } from '../../types/generic';
import { OnChainDecimalSchema } from '../../types/on-chain-decimal';
import { option as O, function as F } from 'fp-ts';

export const LRPParamsSchema = Data.Object({
  versionRecordToken: AssetClassSchema,
  iassetNft: AssetClassSchema,
  iassetPolicyId: Data.Bytes(),
  minRedemptionLovelacesAmt: Data.Integer(),
});
export type LRPParams = Data.Static<typeof LRPParamsSchema>;
const LRPParams = LRPParamsSchema as unknown as LRPParams;

export function castLrpParams(params: LRPParams): Data {
  return Data.castTo(params, LRPParams);
}

