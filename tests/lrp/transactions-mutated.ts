import {
  LucidEvolution,
  TxBuilder,
  OutRef,
  unixTimeToSlot,
  slotToUnixTime,
  UTxO,
  addAssets,
} from '@lucid-evolution/lucid';
import { unzip, zip } from 'fp-ts/lib/Array';
import {
  getInlineDatumOrThrow,
  parsePriceOracleDatum,
  parseIAssetDatumOrThrow,
  matchSingle,
  fromSystemParamsScriptRef,
  SystemParams,
  serialiseLrpDatum,
  parseLrpDatumOrThrow,
  serialiseLrpRedeemer,
  lovelacesAmt,
  MIN_LRP_COLLATERAL_AMT,
  mkLovelacesOf,
  mkAssetsOf,
} from '../../src';
import { ocdMul, OnChainDecimal } from '../../src/types/on-chain-decimal';
import { match, P } from 'ts-pattern';
import { array as A, function as F } from 'fp-ts';
import { calculateFeeFromPercentage } from '../../src/utils/indigo-helpers';

export function buildRedemptionsTx(
  /** The tuple represents the LRP UTXO and the amount of iAssets to redeem against it. */
  redemptions: [UTxO, bigint][],
  price: OnChainDecimal,
  redemptionReimbursementPercentage: OnChainDecimal,
  sysParams: SystemParams,
  tx: TxBuilder,
  /**
   * The number of Tx outputs before these.
   */
  txOutputsBeforeCount: bigint,
  withoutAdaptiveReplace: boolean = false,
): TxBuilder {
  const [[mainLrpUtxo, _], __] = match(redemptions)
    .with(
      [P._, ...P.array()],
      ([[firstLrp, _], ...rest]): [[UTxO, bigint], [UTxO, bigint][]] => [
        [firstLrp, _],
        rest,
      ],
    )
    .otherwise(() => {
      throw new Error('Expects at least 1 UTXO to redeem.');
    });

  const mainLrpDatum = parseLrpDatumOrThrow(getInlineDatumOrThrow(mainLrpUtxo));

  return F.pipe(
    redemptions,
    A.reduceWithIndex<[UTxO, bigint], TxBuilder>(
      tx,
      (idx, acc, [lrpUtxo, redeemIAssetAmt]) => {
        const lovelacesForRedemption = ocdMul(
          {
            getOnChainInt: redeemIAssetAmt,
          },
          price,
        ).getOnChainInt;
        const reimburstmentLovelaces = calculateFeeFromPercentage(
          redemptionReimbursementPercentage,
          lovelacesForRedemption,
        );

        const lrpRawInlineDatum = getInlineDatumOrThrow(lrpUtxo);
        const lrpDatum = parseLrpDatumOrThrow(lrpRawInlineDatum);

        const resultVal = addAssets(
          lrpUtxo.assets,
          mkLovelacesOf(-lovelacesForRedemption + reimburstmentLovelaces),
          mkAssetsOf(
            {
              currencySymbol:
                sysParams.lrpParams.iassetPolicyId.unCurrencySymbol,
              tokenName: mainLrpDatum.iasset,
            },
            redeemIAssetAmt,
          ),
        );

        if (lovelacesAmt(resultVal) < MIN_LRP_COLLATERAL_AMT) {
          throw new Error('LRP was incorrectly initialised.');
        }

        return acc
          .collectFrom(
            [lrpUtxo],
            serialiseLrpRedeemer(
              idx === 0
                ? { Redeem: { continuingOutputIdx: txOutputsBeforeCount + 0n } }
                : {
                    RedeemAuxiliary: {
                      continuingOutputIdx: txOutputsBeforeCount + BigInt(idx),
                      mainRedeemOutRef: {
                        txHash: { hash: mainLrpUtxo.txHash },
                        outputIndex: BigInt(mainLrpUtxo.outputIndex),
                      },
                      asset: mainLrpDatum.iasset,
                      assetPrice: price,
                      redemptionReimbursementPercentage:
                        redemptionReimbursementPercentage,
                    },
                  },
            ),
          )
          .pay.ToContract(
            lrpUtxo.address,
            {
              kind: 'inline',
              value: serialiseLrpDatum(
                {
                  ...lrpDatum,
                  lovelacesToSpend:
                    lrpDatum.lovelacesToSpend - lovelacesForRedemption,
                },
                withoutAdaptiveReplace
                  ? undefined
                  : {
                      _tag: 'adaptiveReplace',
                      spentLrpDatum: lrpRawInlineDatum,
                    },
              ),
            },
            resultVal,
          );
      },
    ),
  );
}

export type RedeemLrpMutatedType =
  | { type: 'no-mutations' }
  | { type: 'ignore-adaptive-replace' };

export async function redeemLrpMutated(
  /** The tuple represents the LRP outref and the amount of iAssets to redeem against it. */
  redemptionLrpsData: [OutRef, bigint][],
  priceOracleOutRef: OutRef,
  iassetOutRef: OutRef,
  lucid: LucidEvolution,
  sysParams: SystemParams,
  redeemLrpMutatedType: RedeemLrpMutatedType = { type: 'no-mutations' },
): Promise<TxBuilder> {
  const network = lucid.config().network!;

  const lrpScriptRefUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(sysParams.scriptReferences.lrpValidatorRef),
    ]),
    (_) => new Error('Expected a single LRP Ref Script UTXO'),
  );

  const priceOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([priceOracleOutRef]),
    (_) => new Error('Expected a single price oracle UTXO'),
  );

  const iassetUtxo = matchSingle(
    await lucid.utxosByOutRef([iassetOutRef]),
    (_) => new Error('Expected a single IAsset UTXO'),
  );

  const iassetDatum = parseIAssetDatumOrThrow(
    getInlineDatumOrThrow(iassetUtxo),
  );

  const [lrpsToRedeemOutRefs, lrpRedemptionIAssetAmt] =
    unzip(redemptionLrpsData);

  const priceOracleDatum = parsePriceOracleDatum(
    getInlineDatumOrThrow(priceOracleUtxo),
  );

  const redemptionLrps = await lucid
    .utxosByOutRef(lrpsToRedeemOutRefs)
    .then((val) => zip(val, lrpRedemptionIAssetAmt));

  const tx = buildRedemptionsTx(
    redemptionLrps,
    priceOracleDatum.price,
    iassetDatum.redemptionReimbursementPercentage,
    sysParams,
    lucid.newTx(),
    0n,
    redeemLrpMutatedType.type === 'ignore-adaptive-replace',
  );

  return (
    lucid
      .newTx()
      .validTo(
        slotToUnixTime(
          network,
          unixTimeToSlot(network, Number(priceOracleDatum.expiration)) - 1,
        ),
      )
      // Ref script
      .readFrom([lrpScriptRefUtxo])
      // Ref inputs
      .readFrom([iassetUtxo, priceOracleUtxo])
      .compose(tx)
  );
}
