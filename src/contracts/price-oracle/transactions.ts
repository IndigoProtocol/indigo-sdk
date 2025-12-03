import {
  addAssets,
  fromText,
  LucidEvolution,
  OutRef,
  slotToUnixTime,
  TxBuilder,
  validatorToAddress,
} from '@lucid-evolution/lucid';
import { AssetClass } from '../../types/generic';
import {
  OracleAssetNft,
  PriceOracleDatum,
  PriceOracleParams,
  serialisePriceOracleDatum,
  serialisePriceOracleRedeemer,
} from './types';
import { mkPriceOracleValidator } from './scripts';
import { oneShotMintTx } from '../one-shot/transactions';
import { mkAssetsOf, mkLovelacesOf } from '../../utils/value-helpers';
import { OnChainDecimal } from '../../types/on-chain-decimal';
import { matchSingle } from '../../utils/utils';
import { ONE_SECOND } from '../../utils/time-helpers';

export async function startPriceOracleTx(
  lucid: LucidEvolution,
  assetName: string,
  startPrice: OnChainDecimal,
  oracleParams: PriceOracleParams,
  now: number = Date.now(),
  refOutRef?: OutRef,
): Promise<[TxBuilder, OracleAssetNft]> {
  if (!refOutRef) {
    refOutRef = (await lucid.wallet().getUtxos())[0];
  }

  const [tx, oracleNftPolicyId] = await oneShotMintTx(lucid, {
    referenceOutRef: {
      txHash: refOutRef.txHash,
      outputIdx: BigInt(refOutRef.outputIndex),
    },
    mintAmounts: [
      {
        tokenName: fromText(assetName),
        amount: 1n,
      },
    ],
  });

  const priceOracleNft: AssetClass = {
    currencySymbol: oracleNftPolicyId,
    tokenName: fromText(assetName),
  };

  const oracleValidator = mkPriceOracleValidator(oracleParams);

  const oracleDatum: PriceOracleDatum = {
    price: startPrice,
    expiration: BigInt(now) + oracleParams.expiration,
  };

  tx.pay.ToContract(
    validatorToAddress(lucid.config().network!, oracleValidator),
    { kind: 'inline', value: serialisePriceOracleDatum(oracleDatum) },
    addAssets(mkLovelacesOf(5_000_000n), mkAssetsOf(priceOracleNft, 1n)),
  );

  return [tx, { oracleNft: priceOracleNft }];
}

export async function feedPriceOracleTx(
  lucid: LucidEvolution,
  oracleOref: OutRef,
  newPrice: OnChainDecimal,
  oracleParams: PriceOracleParams,
  currentSlot: number,
): Promise<TxBuilder> {
  const network = lucid.config().network!;
  const currentTime = BigInt(slotToUnixTime(network, currentSlot));

  const priceOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([oracleOref]),
    (_) => new Error('Expected a single price oracle UTXO'),
  );

  const oracleValidator = mkPriceOracleValidator(oracleParams);

  return lucid
    .newTx()
    .validFrom(Number(currentTime - oracleParams.biasTime) + ONE_SECOND)
    .validTo(Number(currentTime + oracleParams.biasTime) - ONE_SECOND)
    .attach.SpendingValidator(oracleValidator)
    .collectFrom(
      [priceOracleUtxo],
      serialisePriceOracleRedeemer({
        currentTime: currentTime,
        newPrice: newPrice,
      }),
    )
    .pay.ToContract(
      priceOracleUtxo.address,
      {
        kind: 'inline',
        value: serialisePriceOracleDatum({
          price: newPrice,
          expiration: currentTime + oracleParams.expiration,
        }),
      },
      priceOracleUtxo.assets,
    )
    .addSignerKey(oracleParams.owner);
}
