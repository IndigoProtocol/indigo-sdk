import {
  LucidEvolution,
  TxBuilder,
  Credential,
  OutRef,
  addAssets,
  unixTimeToSlot,
  slotToUnixTime,
} from '@lucid-evolution/lucid';
import {
  addrDetails,
  createScriptAddress,
  getInlineDatumOrThrow,
  resolveUtxo,
  UTxOOrOutRef,
} from '../../utils/lucid-utils';
import { unzip, zip } from 'fp-ts/lib/Array';
import {
  LRPDatum,
  parseLrpDatumOrThrow,
  serialiseLrpDatum,
  serialiseLrpRedeemer,
} from './types';
import { parsePriceOracleDatum } from '../price-oracle/types';
import { OnChainDecimal } from '../../types/on-chain-decimal';
import { parseIAssetDatumOrThrow } from '../cdp/types';
import {
  assetClassValueOf,
  mkAssetsOf,
  mkLovelacesOf,
} from '../../utils/value-helpers';
import { matchSingle } from '../../utils/utils';
import { AssetClass } from '../../types/generic';
import {
  fromSystemParamsScriptRef,
  SystemParams,
} from '../../types/system-params';
import { buildRedemptionsTx, MIN_LRP_COLLATERAL_AMT } from './helpers';

export async function openLrp(
  assetTokenName: string,
  lovelacesAmt: bigint,
  maxPrice: OnChainDecimal,
  lucid: LucidEvolution,
  sysParams: SystemParams,
  lrpStakeCredential?: Credential,
): Promise<TxBuilder> {
  const network = lucid.config().network!;

  const [ownPkh, _] = await addrDetails(lucid);

  const newDatum: LRPDatum = {
    owner: ownPkh.hash,
    iasset: assetTokenName,
    maxPrice: maxPrice,
    lovelacesToSpend: lovelacesAmt,
  };

  return lucid.newTx().pay.ToContract(
    createScriptAddress(
      network,
      sysParams.validatorHashes.lrpHash,
      lrpStakeCredential,
    ),
    {
      kind: 'inline',
      value: serialiseLrpDatum(newDatum),
    },
    { lovelace: lovelacesAmt + MIN_LRP_COLLATERAL_AMT },
  );
}

export async function cancelLrp(
  lrp: UTxOOrOutRef,
  sysParams: SystemParams,
  lucid: LucidEvolution,
): Promise<TxBuilder> {
  const lrpScriptRefUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(sysParams.scriptReferences.lrpValidatorRef),
    ]),
    (_) => new Error('Expected a single LRP Ref Script UTXO'),
  );

  const lrpUtxo = await resolveUtxo(lrp, lucid, 'Expected a single LRP UTXO.');

  const lrpDatum = parseLrpDatumOrThrow(getInlineDatumOrThrow(lrpUtxo));

  return lucid
    .newTx()
    .readFrom([lrpScriptRefUtxo])
    .collectFrom([lrpUtxo], serialiseLrpRedeemer('Cancel'))
    .addSignerKey(lrpDatum.owner);
}

export async function redeemLrp(
  /** The tuple represents the LRP outref and the amount of iAssets to redeem against it. */
  redemptionLrpsData: [OutRef, bigint][],
  priceOracle: UTxOOrOutRef,
  iasset: UTxOOrOutRef,
  lucid: LucidEvolution,
  sysParams: SystemParams,
): Promise<TxBuilder> {
  const network = lucid.config().network!;

  const lrpScriptRefUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(sysParams.scriptReferences.lrpValidatorRef),
    ]),
    (_) => new Error('Expected a single LRP Ref Script UTXO'),
  );

  const priceOracleUtxo = await resolveUtxo(
    priceOracle,
    lucid,
    'Expected a single price oracle UTXO',
  );

  const iassetUtxo = await resolveUtxo(
    iasset,
    lucid,
    'Expected a single IAsset UTXO',
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

/**
 * Create Tx adjusting the LRP and claiming the received iAssets
 */
export async function adjustLrp(
  lucid: LucidEvolution,
  lrp: UTxOOrOutRef,
  /**
   * A positive amount increases the lovelaces in the LRP,
   * and a negative amount takes lovelaces from the LRP.
   */
  lovelacesAdjustAmt: bigint,
  newMaxPrice: OnChainDecimal | undefined,
  sysParams: SystemParams,
): Promise<TxBuilder> {
  const lrpScriptRefUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(sysParams.scriptReferences.lrpValidatorRef),
    ]),
    (_) => new Error('Expected a single LRP Ref Script UTXO'),
  );

  const lrpUtxo = await resolveUtxo(lrp, lucid, 'Expected a single LRP UTXO.');

  const lrpDatum = parseLrpDatumOrThrow(getInlineDatumOrThrow(lrpUtxo));

  const rewardAssetClass: AssetClass = {
    currencySymbol: sysParams.lrpParams.iassetPolicyId.unCurrencySymbol,
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

  if (newMaxPrice && newMaxPrice.getOnChainInt < 0n) {
    throw new Error('Max price cannot be negative');
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
          maxPrice: newMaxPrice ? newMaxPrice : lrpDatum.maxPrice,
        }),
      },
      addAssets(
        lrpUtxo.assets,
        mkAssetsOf(rewardAssetClass, -rewardAssetsAmt),
        mkLovelacesOf(lovelacesAdjustAmt),
      ),
    )
    .addSignerKey(lrpDatum.owner);
}

/**
 * Create Tx claiming the received iAssets.
 */
export async function claimLrp(
  lucid: LucidEvolution,
  lrp: UTxOOrOutRef,
  sysParams: SystemParams,
): Promise<TxBuilder> {
  return adjustLrp(lucid, lrp, 0n, undefined, sysParams);
}
