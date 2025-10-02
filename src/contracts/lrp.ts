import {
  LucidEvolution,
  Network,
  ScriptHash,
  TxBuilder,
  Credential,
  OutRef,
  UTxO,
  addAssets,
  unixTimeToSlot,
  slotToUnixTime,
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
import { parsePriceOracleDatum } from '../types/indigo/price-oracle';
import { ocdMul, OnChainDecimal } from '../types/on-chain-decimal';
import { parseIAssetDatum } from '../types/indigo/cdp';
import {
  assetClassValueOf,
  mkAssetsOf,
  mkLovelacesOf,
} from '../helpers/value-helpers';
import { calculateFeeFromPercentage } from '../helpers/indigo-helpers';
import { matchSingle } from '../helpers/helpers';
import { AssetClass } from '../types/generic';

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
  /** The tuple represents the LRP outref and the amount of iAssets to redeem against it. */
  redemptionLrpsData: [OutRef, bigint][],
  lrpRefScriptOutRef: OutRef,
  priceOracleOutRef: OutRef,
  iassetOutRef: OutRef,
  lucid: LucidEvolution,
  lrpParams: LRPParams,
  network: Network,
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

  const [[mainLrpUtxo, _], __] = match(redemptionLrps)
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

  const mainLrpDatum = parseLrpDatum(getInlineDatumOrThrow(mainLrpUtxo));

  const tx = reduceWithIndex<[UTxO, bigint], TxBuilder>(
    lucid.newTx(),
    (idx, acc, [lrpUtxo, redeemIAssetAmt]) => {
      const lovelacesForRedemption = ocdMul(
        {
          getOnChainInt: redeemIAssetAmt,
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

/**
 * Create Tx adjusting the LRP and claiming the received iAssets
 */
export async function adjustLrp(
  lucid: LucidEvolution,
  lrpOutRef: OutRef,
  /**
   * A positive amount increases the lovelaces in the LRP,
   * and a negative amount takes lovelaces from the LRP.
   */
  lovelacesAdjustAmt: bigint,
  lrpRefScriptOutRef: OutRef,
  lrpParams: LRPParams,
): Promise<TxBuilder> {
  const ownAddr = await lucid.wallet().address();

  const lrpScriptRefUtxo = matchSingle(
    await lucid.utxosByOutRef([lrpRefScriptOutRef]),
    (_) => new Error('Expected a single LRP Ref Script UTXO'),
  );

  const lrpUtxo = matchSingle(
    await lucid.utxosByOutRef([lrpOutRef]),
    (_) => new Error('Expected a single LRP UTXO.'),
  );

  const lrpDatum = parseLrpDatum(getInlineDatumOrThrow(lrpUtxo));

  const rewardAssetClass: AssetClass = {
    currencySymbol: lrpParams.iassetPolicyId,
    tokenName: lrpDatum.iasset,
  };
  const rewardAssetsAmt = assetClassValueOf(lrpUtxo.assets, rewardAssetClass);

  // The claim case
  if (lovelacesAdjustAmt === 0n && lrpDatum.lovelacesToSpend === 0n) {
    throw new Error(
      "When there's no more lovelaces to spend, use close instead of claim.",
    );
  }

  // Negative adjust case
  if (
    lovelacesAdjustAmt < 0 &&
    lrpDatum.lovelacesToSpend <= lovelacesAdjustAmt
  ) {
    throw new Error(
      "Can't adjust negatively by more than available. Also, for adjusting by exactly the amount deposited, a close action should be used instead.",
    );
  }

  return lucid
    .newTx()
    .readFrom([lrpScriptRefUtxo])
    .collectFrom([lrpUtxo], serialiseLrpRedeemer('Cancel'))
    .pay.ToContract(
      lrpUtxo.address,
      {
        kind: 'inline',
        value: serialiseLrpDatum({
          ...lrpDatum,
          lovelacesToSpend: lrpDatum.lovelacesToSpend + lovelacesAdjustAmt,
        }),
      },
      addAssets(
        lrpUtxo.assets,
        mkAssetsOf(rewardAssetClass, -rewardAssetsAmt),
        mkLovelacesOf(lovelacesAdjustAmt),
      ),
    )
    .addSigner(ownAddr);
}

/**
 * Create Tx claiming the received iAssets.
 */
export async function claimLrp(
  lucid: LucidEvolution,
  lrpOutRef: OutRef,
  lrpRefScriptOutRef: OutRef,
  lrpParams: LRPParams,
): Promise<TxBuilder> {
  return adjustLrp(lucid, lrpOutRef, 0n, lrpRefScriptOutRef, lrpParams);
}
