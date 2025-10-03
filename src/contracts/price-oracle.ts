import {
  addAssets,
  fromText,
  LucidEvolution,
  OutRef,
  TxBuilder,
  validatorToAddress,
} from '@lucid-evolution/lucid';
import { AssetClass } from '../types/generic';
import {
  PriceOracleDatum,
  PriceOracleParams,
  serialisePriceOracleDatum,
} from '../types/indigo/price-oracle';
import { mkPriceOracleValidator } from '../scripts/price-oracle-validator';
import { oneShotMintTx } from './one-shot';
import { mkAssetsOf, mkLovelacesOf } from '../helpers/value-helpers';
import { OnChainDecimal } from '../types/on-chain-decimal';

export async function startPriceOracleTx(
  lucid: LucidEvolution,
  assetName: string,
  startPrice: OnChainDecimal,
  oracleParams: PriceOracleParams,
  now: number = Date.now(),
  refOutRef?: OutRef,
): Promise<[TxBuilder, AssetClass]> {
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

  return [tx, priceOracleNft];
}
