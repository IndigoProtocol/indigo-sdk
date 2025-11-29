import { pipe } from 'fp-ts/lib/function';
import {
  array as A,
  option as O,
  string as S,
  ord as Ord,
  function as F,
} from 'fp-ts';
import { TreasuryWithdrawal, TreasuryWithdrawalItem } from './types';
import {
  addAssets,
  Assets,
  LucidEvolution,
  OutRef,
  toText,
} from '@lucid-evolution/lucid';
import { mkAssetsOf } from '../../utils/value-helpers';
import {
  IAssetContent,
  IAssetOutput,
  parseIAssetDatumOrThrow,
} from '../cdp/types';
import { ProposeAssetContent } from './types-new';
import { matchSingle } from '../../utils/utils';
import { getInlineDatumOrThrow } from '../../utils/lucid-utils';

export function proposalDeposit(
  baseDeposit: bigint,
  activeProposals: bigint,
): bigint {
  return baseDeposit * 2n ** activeProposals;
}

export function createValueFromWithdrawal(w: TreasuryWithdrawal): Assets {
  return A.reduce<TreasuryWithdrawalItem, Assets>({}, (acc, [cs, tk, amt]) =>
    addAssets(acc, mkAssetsOf({ currencySymbol: cs, tokenName: tk }, amt)),
  )(w.value);
}

/**
 * Find the IAsset that should be a preceding one for the new IAsset token name.
 * In case there are no iassets, none should be returned.
 */
export async function findRelativeIAssetForInsertion(
  /**
   * UFT encoded
   */
  newIAssetTokenName: string,
  allIAssetOrefs: OutRef[],
  lucid: LucidEvolution,
): Promise<O.Option<IAssetOutput>> {
  const iassetUtxos = await Promise.all(
    allIAssetOrefs.map(async (oref) => {
      const iassetUtxo = matchSingle(
        await lucid.utxosByOutRef([oref]),
        (_) => new Error('Expected a single IAsset UTXO'),
      );

      const datum = parseIAssetDatumOrThrow(getInlineDatumOrThrow(iassetUtxo));

      return { datum: datum, utxo: iassetUtxo };
    }),
  );

  // The iasset just before the new token name based on assets ordering
  return pipe(
    // Sort the asset names
    iassetUtxos,
    A.sort(
      Ord.contramap<string, IAssetOutput>((x) => toText(x.datum.assetName))(
        S.Ord,
      ),
    ),
    // split head and tail
    A.foldLeft(
      () => O.none,
      (head, rest) => O.some<[IAssetOutput, IAssetOutput[]]>([head, rest]),
    ),
    // find the preceding iasset for the new token name
    O.flatMap(([firstIAsset, rest]) =>
      O.some(
        A.reduce<IAssetOutput, IAssetOutput>(firstIAsset, (acc, iasset) =>
          toText(iasset.datum.assetName) < newIAssetTokenName ? iasset : acc,
        )(rest),
      ),
    ),
  );
}

export function iassetCreationDatumHelper(
  proposeAssetContent: ProposeAssetContent,
  referencedIAsset: O.Option<IAssetContent>,
): { newIAsset: IAssetContent; newReferencedIAsset: O.Option<IAssetContent> } {
  const newContent: IAssetContent = {
    assetName: proposeAssetContent.asset,
    price: { Oracle: { content: proposeAssetContent.priceOracleNft } },
    interestOracleNft: proposeAssetContent.interestOracleNft,
    redemptionRatio: proposeAssetContent.redemptionRatioPercentage,
    maintenanceRatio: proposeAssetContent.maintenanceRatioPercentage,
    liquidationRatio: proposeAssetContent.liquidationRatioPercentage,
    debtMintingFeePercentage: proposeAssetContent.debtMintingFeePercentage,
    liquidationProcessingFeePercentage:
      proposeAssetContent.liquidationProcessingFeePercentage,
    stabilityPoolWithdrawalFeePercentage:
      proposeAssetContent.stabilityPoolWithdrawalFeePercentage,
    redemptionReimbursementPercentage:
      proposeAssetContent.redemptionReimbursementPercentage,
    redemptionProcessingFeePercentage:
      proposeAssetContent.redemptionProcessingFeePercentage,
    interestCollectorPortionPercentage:
      proposeAssetContent.interestCollectorPortionPercentage,
    firstIAsset: true,
    nextIAsset: null,
  };

  return F.pipe(
    referencedIAsset,
    O.match<
      IAssetContent,
      { newIAsset: IAssetContent; newReferencedIAsset: O.Option<IAssetContent> }
    >(
      () => ({
        newIAsset: newContent,
        newReferencedIAsset: O.none,
      }),
      (referencedIA) => {
        if (
          toText(proposeAssetContent.asset) < toText(referencedIA.assetName)
        ) {
          return {
            newIAsset: {
              ...newContent,
              firstIAsset: true,
              nextIAsset: referencedIA.assetName,
            },
            newReferencedIAsset: O.some({
              ...referencedIA,
              firstIAsset: false,
            }),
          };
        } else {
          return {
            newIAsset: {
              ...newContent,
              firstIAsset: false,
              nextIAsset: referencedIA.nextIAsset,
            },
            newReferencedIAsset: O.some({
              ...referencedIA,
              nextIAsset: proposeAssetContent.asset,
            }),
          };
        }
      },
    ),
  );
}
