import { Data, Datum, Redeemer, UTxO } from '@lucid-evolution/lucid';
import { AssetClassSchema, OutputReferenceSchema } from '../../types/generic';
import {
  OnChainDecimal,
  OnChainDecimalSchema,
} from '../../types/on-chain-decimal';
import { option as O, function as F } from 'fp-ts';
import { match, P } from 'ts-pattern';

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

export const LRPRedeemerSchema = Data.Enum([
  Data.Object({ Redeem: Data.Object({ continuingOutputIdx: Data.Integer() }) }),
  Data.Object({
    RedeemAuxiliary: Data.Object({
      continuingOutputIdx: Data.Integer(),
      mainRedeemOutRef: OutputReferenceSchema,
      asset: Data.Bytes(),
      assetPrice: OnChainDecimalSchema,
      redemptionReimbursementPercentage: OnChainDecimalSchema,
    }),
  }),
  Data.Literal('Cancel'),
  Data.Literal('UpgradeVersion'),
]);
export type LRPRedeemer = Data.Static<typeof LRPRedeemerSchema>;
const LRPRedeemer = LRPRedeemerSchema as unknown as LRPRedeemer;

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

type LRPSerialisationOptions =
  // No replacing, just use non-canonical format.
  | { _tag: 'noReplace' }
  // Adaptive replace, when the spentDatum is canonical, do the replace,
  // otherwise use the non canonical.
  | { _tag: 'adaptiveReplace'; spentLrpDatum: string };

export function serialiseLrpDatum(
  datum: LRPDatum,
  // Overall, we don't want to do the replacing. We just use non-canonical format.
  serialisationOptions: LRPSerialisationOptions = { _tag: 'noReplace' },
): Datum {
  const d = Data.to<LRPDatum>(datum, LRPDatum);

  return match(serialisationOptions)
    .returnType<Datum>()
    .with({ _tag: 'noReplace' }, () => d)
    .with(
      { _tag: 'adaptiveReplace', spentLrpDatum: P.select() },
      (spentLrpDatum) => {
        const isSpentDatumCanonical = spentLrpDatum.includes(
          Data.to<OnChainDecimal>(
            parseLrpDatumOrThrow(spentLrpDatum).maxPrice,
            OnChainDecimal,
            {
              canonical: true,
            },
          ),
        );

        // When spent datum was canonical, replace.
        if (isSpentDatumCanonical) {
          // If the lrp was created using a canonical on-chain decimal, we need to serialise it canonically.
          // This is due to some issue related to how Aiken compares objects.
          // See "Wrong continuing output" trace, specifically the spread of the previous datum ie. expecting the serialisation to be the same as it was created with
          // We however do not want to do this for any lrps that are being build canonical.
          const ocdSerialisedCanonical = Data.to<OnChainDecimal>(
            datum.maxPrice,
            OnChainDecimal,
            { canonical: true },
          );
          const ocdSerialisedNonCanonical = Data.to<OnChainDecimal>(
            datum.maxPrice,
            OnChainDecimal,
            { canonical: false },
          );

          return d.replace(ocdSerialisedNonCanonical, ocdSerialisedCanonical);
        }

        return d;
      },
    )
    .exhaustive();
}

export function serialiseLrpRedeemer(redeemer: LRPRedeemer): Redeemer {
  return Data.to<LRPRedeemer>(redeemer, LRPRedeemer);
}

export function castLrpParams(params: LRPParams): Data {
  return Data.castTo(params, LRPParams);
}

export type LrpOutput = { datum: LRPDatum; utxo: UTxO };
