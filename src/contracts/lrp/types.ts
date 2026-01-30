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

export const LRPDatumSchema = Data.Object({
  owner: Data.Bytes(),
  iasset: Data.Bytes(),
  maxPrice: OnChainDecimalSchema,
  /**
   * The amount of lovelaces that is available to be spent.
   * This doesn't correspond to the lovelaces in UTXO's value,
   * since that can contain fees, too.
   */
  lovelacesToSpend: Data.Integer(),
});
export type LRPDatum = Data.Static<typeof LRPDatumSchema>;
const LRPDatum = LRPDatumSchema as unknown as LRPDatum;

export function parseLrpDatum(datum: Datum): O.Option<LRPDatum> {
  try {
    return O.some(Data.from<LRPDatum>(datum, LRPDatum));
  } catch (_) {
    return O.none;
  }
}

export function parseLrpDatumOrThrow(datum: Datum): LRPDatum {
  return F.pipe(
    parseLrpDatum(datum),
    O.match(() => {
      throw new Error('Expected an LRP datum.');
    }, F.identity),
  );
}

export function serialiseLrpDatum(datum: LRPDatum): Datum {
  return Data.to<LRPDatum>(datum, LRPDatum);
}

export function castLrpParams(params: LRPParams): Data {
  return Data.castTo(params, LRPParams);
}

export type LrpOutput = { datum: LRPDatum; utxo: UTxO };
