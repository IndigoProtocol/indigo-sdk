import {
  LucidEvolution,
  Network,
  ScriptHash,
  TxBuilder,
  Credential,
  OutRef,
  UTxO,
  addAssets,
} from '@lucid-evolution/lucid';
import {
  addrDetails,
  createScriptAddress,
  getInlineDatumOrThrow,
} from '../helpers/lucid-utils';
import { match, P } from 'ts-pattern';
import { unzip, zip } from 'fp-ts/lib/Array';
import { reduceWithIndex } from 'fp-ts/lib/Array';
import {
  LRPDatum,
  LRPParams,
  parseLrpDatum,
  serialiseLrpDatum,
  serialiseLrpRedeemer,
} from '../types/indigo/lrp';
import {
  parsePriceOracleDatum,
  PriceOracleParams,
} from '../types/indigo/price-oracle';
import { ocdMul, OnChainDecimal } from '../types/on-chain-decimal';
import { parseIAssetDatum } from '../types/indigo/cdp';
import { mkAssetsOf, mkLovelacesOf } from '../helpers/value-helpers';
import { oracleExpirationAwareValidity } from '../helpers/price-oracle-helpers';
import { calculateFeeFromPercentage } from '../helpers/indigo-helpers';
import { matchSingle } from '../helpers/helpers';

const MIN_UTXO_COLLATERAL_AMT = 2_000_000n;

export async function openLrp(
  assetTokenName: string,
  lovelacesAmt: bigint,
  maxPrice: OnChainDecimal,
  lucid: LucidEvolution,
  lrpScriptHash: ScriptHash,
  network: Network,
  lrpStakeCredential?: Credential,
): Promise<TxBuilder> {
  const [ownPkh, _] = await addrDetails(lucid);

  const newDatum: LRPDatum = {
    owner: ownPkh.hash,
    iasset: assetTokenName,
    maxPrice: maxPrice,
    lovelacesToSpend: lovelacesAmt,
  };

  return lucid.newTx().pay.ToContract(
    createScriptAddress(network, lrpScriptHash, lrpStakeCredential),
    {
      kind: 'inline',
      value: serialiseLrpDatum(newDatum),
    },
    { lovelace: lovelacesAmt + MIN_UTXO_COLLATERAL_AMT },
  );
}

export async function cancelLrp(
  lrpOutRef: OutRef,
  lrpRefScriptOutRef: OutRef,
  lucid: LucidEvolution,
): Promise<TxBuilder> {
  const ownAddr = await lucid.wallet().address();
  // TODO: use Promise.all
  const lrpScriptRefUtxo = matchSingle(
    await lucid.utxosByOutRef([lrpRefScriptOutRef]),
    (_) => new Error('Expected a single LRP Ref Script UTXO'),
  );

  const lrpUtxo = matchSingle(
    await lucid.utxosByOutRef([lrpOutRef]),
    (_) => new Error('Expected a single LRP UTXO.'),
  );

  return lucid
    .newTx()
    .readFrom([lrpScriptRefUtxo])
    .collectFrom([lrpUtxo], serialiseLrpRedeemer('Cancel'))
    .addSigner(ownAddr);
}

export async function redeemLrp(
  redemptionLrpsData: [OutRef, bigint][],
  lrpRefScriptOutRef: OutRef,
  priceOracleOutRef: OutRef,
  iassetOutRef: OutRef,
  lucid: LucidEvolution,
  lrpParams: LRPParams,
  priceOracleParams: PriceOracleParams,
  network: Network,
  currentSlot: number,
): Promise<TxBuilder> {
  const lrpScriptRefUtxo = matchSingle(
    await lucid.utxosByOutRef([lrpRefScriptOutRef]),
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

  const iassetDatum = parseIAssetDatum(getInlineDatumOrThrow(iassetUtxo));

  const [lrpsToRedeemOutRefs, lrpRedemptionIAssetAmt] =
    unzip(redemptionLrpsData);

  const priceOracleDatum = parsePriceOracleDatum(
    getInlineDatumOrThrow(priceOracleUtxo),
  );

  const redemptionLrps = await lucid
    .utxosByOutRef(lrpsToRedeemOutRefs)
    .then((val) => zip(val, lrpRedemptionIAssetAmt));

  const [[mainLrpUtxo, mainLrpRedemptionIAssetAmt], _] = match(redemptionLrps)
    .with(
      [P._, ...P.array()],
      ([[firstLrp, firstLrpIAssetAmt], ...rest]): [
        [UTxO, bigint],
        [UTxO, bigint][],
      ] => [[firstLrp, firstLrpIAssetAmt], rest],
    )
    .otherwise(() => {
      throw new Error('Expects at least 1 UTXO to redeem.');
    });

  const mainLrpDatum = parseLrpDatum(getInlineDatumOrThrow(mainLrpUtxo));

  const tx = reduceWithIndex<[UTxO, bigint], TxBuilder>(
    lucid.newTx(),
    (idx, acc, [lrpUtxo, redeemIAssetAmt]) => {
      const lovelacesForRedemption = ocdMul(
        {
          getOnChainInt: mainLrpRedemptionIAssetAmt,
        },
        priceOracleDatum.price,
      ).getOnChainInt;
      const reimburstmentLovelaces = calculateFeeFromPercentage(
        iassetDatum.redemptionReimbursementPercentage,
        lovelacesForRedemption,
      );

      const lrpDatum = parseLrpDatum(getInlineDatumOrThrow(lrpUtxo));

      return acc
        .collectFrom(
          [lrpUtxo],
          serialiseLrpRedeemer(
            idx === 0
              ? { Redeem: { continuingOutputIdx: 0n } }
              : {
                  RedeemAuxiliary: {
                    continuingOutputIdx: BigInt(idx),
                    mainRedeemOutRef: {
                      txHash: { hash: mainLrpUtxo.txHash },
                      outputIndex: BigInt(mainLrpUtxo.outputIndex),
                    },
                    asset: mainLrpDatum.iasset,
                    assetPrice: priceOracleDatum.price,
                    redemptionReimbursementPercentage:
                      iassetDatum.redemptionReimbursementPercentage,
                  },
                },
          ),
        )
        .pay.ToContract(
          lrpUtxo.address,
          {
            kind: 'inline',
            value: serialiseLrpDatum({
              ...lrpDatum,
              lovelacesToSpend:
                lrpDatum.lovelacesToSpend - lovelacesForRedemption,
            }),
          },
          addAssets(
            lrpUtxo.assets,
            mkLovelacesOf(-(lovelacesForRedemption - reimburstmentLovelaces)),
            mkAssetsOf(
              {
                currencySymbol: lrpParams.iassetPolicyId,
                tokenName: mainLrpDatum.iasset,
              },
              redeemIAssetAmt,
            ),
          ),
        );
    },
  )(redemptionLrps);

  const txValidity = oracleExpirationAwareValidity(
    currentSlot,
    Number(priceOracleParams.biasTime),
    Number(priceOracleDatum.expiration),
    network,
  );

  return (
    lucid
      .newTx()
      .validFrom(txValidity.validFrom)
      .validTo(txValidity.validTo)
      // Ref script
      .readFrom([lrpScriptRefUtxo])
      // Ref inputs
      .readFrom([iassetUtxo, priceOracleUtxo])
      .compose(tx)
  );
}
