import {
  addAssets,
  Data,
  LucidEvolution,
  OutRef,
  slotToUnixTime,
  TxBuilder,
} from '@lucid-evolution/lucid';
import {
  fromSystemParamsAsset,
  fromSystemParamsScriptRef,
  SystemParams,
} from '../types/system-params';
import { CollectorContract } from './collector';
import { TreasuryContract } from './treasury';
import {
  addrDetails,
  createScriptAddress,
  getInlineDatumOrThrow,
} from '../helpers/lucid-utils';
import { calculateFeeFromPercentage, matchSingle } from '../helpers/helpers';
import {
  parseCdpDatumOrThrow,
  parseIAssetDatumOrThrow,
  serialiseCdpDatum,
  serialiseCdpRedeemer,
} from '../types/indigo/cdp';
import { _cdpValidator } from '../scripts/cdp-validator';
import { parsePriceOracleDatum } from '../types/indigo/price-oracle';
import { parseInterestOracleDatum } from '../types/indigo/interest-oracle';
import { parseGovDatumOrThrow } from '../types/indigo/gov';
import {
  calculateAccruedInterest,
  calculateUnitaryInterestSinceOracleLastUpdated,
} from '../helpers/interest-oracle';
import { oracleExpirationAwareValidity } from '../helpers/price-oracle-helpers';
import { match, P } from 'ts-pattern';
import { serialiseCDPCreatorRedeemer } from '../types/indigo/cdp-creator';
import {
  lovelacesAmt,
  mkAssetsOf,
  mkLovelacesOf,
} from '../helpers/value-helpers';
import { calculateMinCollateralCappedIAssetRedemptionAmt } from '../helpers/cdp-helpers';
import { bigintMin } from '../utils';
import { ocdMul } from '../types/on-chain-decimal';

export async function openCdp(
  collateralAmount: bigint,
  mintedAmount: bigint,
  sysParams: SystemParams,
  cdpCreatorOref: OutRef,
  iassetOref: OutRef,
  priceOracleOref: OutRef,
  interestOracleOref: OutRef,
  collectorOref: OutRef,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  const network = lucid.config().network!;
  const currentTime = BigInt(slotToUnixTime(network, currentSlot));

  const [pkh, skh] = await addrDetails(lucid);

  const cdpCreatorRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.cdpCreatorValidatorRef,
      ),
    ]),
    (_) => new Error('Expected a single cdp creator Ref Script UTXO'),
  );
  const cdpAuthTokenPolicyRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.authTokenPolicies.cdpAuthTokenRef,
      ),
    ]),
    (_) => new Error('Expected a single cdp auth token policy Ref Script UTXO'),
  );
  const iAssetTokenPolicyRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.iAssetTokenPolicyRef,
      ),
    ]),
    (_) => new Error('Expected a single iasset token policy Ref Script UTXO'),
  );

  const iassetUtxo = matchSingle(
    await lucid.utxosByOutRef([iassetOref]),
    (_) => new Error('Expected a single iasset UTXO'),
  );
  const iassetDatum = parseIAssetDatumOrThrow(
    getInlineDatumOrThrow(iassetUtxo),
  );

  const priceOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([priceOracleOref]),
    (_) => new Error('Expected a single price oracle UTXO'),
  );
  const priceOracleDatum = parsePriceOracleDatum(
    getInlineDatumOrThrow(priceOracleUtxo),
  );

  const interestOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([interestOracleOref]),
    (_) => new Error('Expected a single interest oracle UTXO'),
  );
  const interestOracleDatum = parseInterestOracleDatum(
    getInlineDatumOrThrow(interestOracleUtxo),
  );

  const cdpCreatorUtxo = matchSingle(
    await lucid.utxosByOutRef([cdpCreatorOref]),
    (_) => new Error('Expected a single CDP creator UTXO'),
  );

  match(iassetDatum.price)
    .with({ Delisted: P.any }, () => {
      throw new Error("Can't open CDP of delisted asset");
    })
    .otherwise(() => {});

  const cdpNftVal = mkAssetsOf(
    fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
    1n,
  );

  const iassetTokensVal = mkAssetsOf(
    {
      currencySymbol: sysParams.cdpParams.cdpAssetSymbol.unCurrencySymbol,
      tokenName: iassetDatum.assetName,
    },
    mintedAmount,
  );

  const txValidity = oracleExpirationAwareValidity(
    currentSlot,
    Number(sysParams.cdpCreatorParams.biasTime),
    Number(priceOracleDatum.expiration),
    network,
  );

  const tx = lucid
    .newTx()
    .validFrom(txValidity.validFrom)
    .validTo(txValidity.validTo)
    .readFrom([
      cdpCreatorRefScriptUtxo,
      cdpAuthTokenPolicyRefScriptUtxo,
      iAssetTokenPolicyRefScriptUtxo,
    ])
    .mintAssets(cdpNftVal, Data.void())
    .mintAssets(iassetTokensVal, Data.void())
    .collectFrom(
      [cdpCreatorUtxo],
      serialiseCDPCreatorRedeemer({
        CreateCDP: {
          cdpOwner: pkh.hash,
          minted: mintedAmount,
          collateral: collateralAmount,
          currentTime: currentTime,
        },
      }),
    )
    .pay.ToContract(
      createScriptAddress(network, sysParams.validatorHashes.cdpHash, skh),
      {
        kind: 'inline',
        value: serialiseCdpDatum({
          cdpOwner: pkh.hash,
          iasset: iassetDatum.assetName,
          mintedAmt: mintedAmount,
          cdpFees: {
            ActiveCDPInterestTracking: {
              lastSettled: currentTime,
              unitaryInterestSnapshot:
                calculateUnitaryInterestSinceOracleLastUpdated(
                  currentTime,
                  interestOracleDatum,
                ) + interestOracleDatum.unitaryInterest,
            },
          },
        }),
      },
      addAssets(cdpNftVal, mkLovelacesOf(collateralAmount)),
    )
    .pay.ToContract(
      cdpCreatorUtxo.address,
      { kind: 'inline', value: Data.void() },
      cdpCreatorUtxo.assets,
    )
    .readFrom([priceOracleUtxo, interestOracleUtxo, iassetUtxo])
    .addSignerKey(pkh.hash);

  const debtMintingFee = calculateFeeFromPercentage(
    BigInt(iassetDatum.debtMintingFeePercentage.getOnChainInt),
    (mintedAmount * priceOracleDatum.price.getOnChainInt) / 1_000_000n,
  );

  if (debtMintingFee > 0) {
    await CollectorContract.feeTx(
      debtMintingFee,
      lucid,
      sysParams,
      tx,
      collectorOref,
    );
  }

  return tx;
}

async function adjustCdp(
  collateralAmount: bigint,
  mintAmount: bigint,
  cdpOref: OutRef,
  iassetOref: OutRef,
  priceOracleOref: OutRef,
  interestOracleOref: OutRef,
  collectorOref: OutRef,
  govOref: OutRef,
  treasuryOref: OutRef,
  sysParams: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  const network = lucid.config().network!;
  const currentTime = BigInt(slotToUnixTime(network, currentSlot));

  const [pkh, _] = await addrDetails(lucid);

  const cdpRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(sysParams.scriptReferences.cdpValidatorRef),
    ]),
    (_) => new Error('Expected a single cdp Ref Script UTXO'),
  );

  const cdpUtxo = matchSingle(
    await lucid.utxosByOutRef([cdpOref]),
    (_) => new Error('Expected a single cdp UTXO'),
  );
  const cdpDatum = parseCdpDatumOrThrow(getInlineDatumOrThrow(cdpUtxo));

  const iassetUtxo = matchSingle(
    await lucid.utxosByOutRef([iassetOref]),
    (_) => new Error('Expected a single iasset UTXO'),
  );
  const iassetDatum = parseIAssetDatumOrThrow(
    getInlineDatumOrThrow(iassetUtxo),
  );

  const govUtxo = matchSingle(
    await lucid.utxosByOutRef([govOref]),
    (_) => new Error('Expected a single gov UTXO'),
  );
  const govDatum = parseGovDatumOrThrow(getInlineDatumOrThrow(govUtxo));

  const priceOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([priceOracleOref]),
    (_) => new Error('Expected a single price oracle UTXO'),
  );
  const priceOracleDatum = parsePriceOracleDatum(
    getInlineDatumOrThrow(priceOracleUtxo),
  );

  const interestOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([interestOracleOref]),
    (_) => new Error('Expected a single interest oracle UTXO'),
  );
  const interestOracleDatum = parseInterestOracleDatum(
    getInlineDatumOrThrow(interestOracleUtxo),
  );

  match(iassetDatum.price)
    .with({ Delisted: P.any }, () => {
      throw new Error("Can't adjust CDP of delisted asset");
    })
    .otherwise(() => {});

  const txValidity = oracleExpirationAwareValidity(
    currentSlot,
    Number(sysParams.cdpCreatorParams.biasTime),
    Number(priceOracleDatum.expiration),
    network,
  );

  const tx = lucid
    .newTx()
    .validFrom(txValidity.validFrom)
    .validTo(txValidity.validTo)
    .collectFrom(
      [cdpUtxo],
      serialiseCdpRedeemer({
        AdjustCdp: {
          collateralAmtChange: collateralAmount,
          currentTime: currentTime,
          mintedAmtChange: mintAmount,
        },
      }),
    )
    .readFrom([cdpRefScriptUtxo])
    .readFrom([iassetUtxo, govUtxo, priceOracleUtxo, interestOracleUtxo])
    .addSignerKey(pkh.hash)
    .pay.ToContract(
      cdpUtxo.address,
      {
        kind: 'inline',
        value: serialiseCdpDatum({
          ...cdpDatum,
          mintedAmt: cdpDatum.mintedAmt + mintAmount,
          cdpFees: {
            ActiveCDPInterestTracking: {
              lastSettled: currentTime,
              unitaryInterestSnapshot:
                calculateUnitaryInterestSinceOracleLastUpdated(
                  currentTime,
                  interestOracleDatum,
                ) + interestOracleDatum.unitaryInterest,
            },
          },
        }),
      },
      addAssets(cdpUtxo.assets, mkLovelacesOf(collateralAmount)),
    );

  if (mintAmount !== 0n) {
    const iAssetTokenPolicyRefScriptUtxo = matchSingle(
      await lucid.utxosByOutRef([
        fromSystemParamsScriptRef(
          sysParams.scriptReferences.iAssetTokenPolicyRef,
        ),
      ]),
      (_) => new Error('Expected a single iasset token policy Ref Script UTXO'),
    );

    const iassetTokensVal = mkAssetsOf(
      {
        currencySymbol: sysParams.cdpParams.cdpAssetSymbol.unCurrencySymbol,
        tokenName: iassetDatum.assetName,
      },
      mintAmount,
    );

    tx.readFrom([iAssetTokenPolicyRefScriptUtxo]).mintAssets(
      iassetTokensVal,
      Data.void(),
    );
  }

  const interestAdaAmt = match(cdpDatum.cdpFees)
    .with({ FrozenCDPAccumulatedFees: P.any }, () => {
      throw new Error('CDP fees wrong');
    })
    .with({ ActiveCDPInterestTracking: P.select() }, (interest) => {
      const interestPaymentIAssetAmt = calculateAccruedInterest(
        currentTime,
        interest.unitaryInterestSnapshot,
        cdpDatum.mintedAmt,
        interest.lastSettled,
        interestOracleDatum,
      );

      return (
        (interestPaymentIAssetAmt * priceOracleDatum.price.getOnChainInt) /
        1_000_000n
      );
    })
    .exhaustive();

  const interestCollectorAdaAmt = calculateFeeFromPercentage(
    iassetDatum.interestCollectorPortionPercentage.getOnChainInt,
    interestAdaAmt,
  );
  const interestTreasuryAdaAmt = interestAdaAmt - interestCollectorAdaAmt;

  if (interestTreasuryAdaAmt > 0) {
    await TreasuryContract.feeTx(
      interestTreasuryAdaAmt,
      lucid,
      sysParams,
      tx,
      treasuryOref,
    );
  }

  let collectorFee = interestCollectorAdaAmt;

  // when mint
  if (mintAmount > 0n) {
    collectorFee += calculateFeeFromPercentage(
      iassetDatum.debtMintingFeePercentage.getOnChainInt,
      (mintAmount * priceOracleDatum.price.getOnChainInt) / 1_000_000n,
    );
  }

  // when withdraw
  if (collateralAmount < 0n) {
    collectorFee += calculateFeeFromPercentage(
      govDatum.protocolParams.collateralFeePercentage.getOnChainInt,
      -collateralAmount,
    );
  }

  if (collectorFee > 0n) {
    await CollectorContract.feeTx(
      collectorFee,
      lucid,
      sysParams,
      tx,
      collectorOref,
    );
  }

  return tx;
}

export async function depositCdp(
  amount: bigint,
  cdpOref: OutRef,
  iassetOref: OutRef,
  priceOracleOref: OutRef,
  interestOracleOref: OutRef,
  collectorOref: OutRef,
  govOref: OutRef,
  treasuryOref: OutRef,
  params: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  return adjustCdp(
    amount,
    0n,
    cdpOref,
    iassetOref,
    priceOracleOref,
    interestOracleOref,
    collectorOref,
    govOref,
    treasuryOref,
    params,
    lucid,
    currentSlot,
  );
}

export async function withdrawCdp(
  amount: bigint,
  cdpOref: OutRef,
  iassetOref: OutRef,
  priceOracleOref: OutRef,
  interestOracleOref: OutRef,
  collectorOref: OutRef,
  govOref: OutRef,
  treasuryOref: OutRef,
  params: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  return adjustCdp(
    -amount,
    0n,
    cdpOref,
    iassetOref,
    priceOracleOref,
    interestOracleOref,
    collectorOref,
    govOref,
    treasuryOref,
    params,
    lucid,
    currentSlot,
  );
}

export async function mintCdp(
  amount: bigint,
  cdpOref: OutRef,
  iassetOref: OutRef,
  priceOracleOref: OutRef,
  interestOracleOref: OutRef,
  collectorOref: OutRef,
  govOref: OutRef,
  treasuryOref: OutRef,
  params: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  return adjustCdp(
    0n,
    amount,
    cdpOref,
    iassetOref,
    priceOracleOref,
    interestOracleOref,
    collectorOref,
    govOref,
    treasuryOref,
    params,
    lucid,
    currentSlot,
  );
}

export async function burnCdp(
  amount: bigint,
  cdpOref: OutRef,
  iassetOref: OutRef,
  priceOracleOref: OutRef,
  interestOracleOref: OutRef,
  collectorOref: OutRef,
  govOref: OutRef,
  treasuryOref: OutRef,
  params: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  return adjustCdp(
    0n,
    -amount,
    cdpOref,
    iassetOref,
    priceOracleOref,
    interestOracleOref,
    collectorOref,
    govOref,
    treasuryOref,
    params,
    lucid,
    currentSlot,
  );
}

export async function closeCdp(
  cdpOref: OutRef,
  iassetOref: OutRef,
  priceOracleOref: OutRef,
  interestOracleOref: OutRef,
  collectorOref: OutRef,
  govOref: OutRef,
  treasuryOref: OutRef,
  sysParams: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  const network = lucid.config().network!;
  // Find Pkh, Skh
  const [pkh, _] = await addrDetails(lucid);
  const currentTime = BigInt(slotToUnixTime(network, currentSlot));

  const cdpRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(sysParams.scriptReferences.cdpValidatorRef),
    ]),
    (_) => new Error('Expected a single cdp Ref Script UTXO'),
  );

  const cdpAuthTokenPolicyRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.authTokenPolicies.cdpAuthTokenRef,
      ),
    ]),
    (_) => new Error('Expected a single cdp auth token policy Ref Script UTXO'),
  );

  const iAssetTokenPolicyRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.iAssetTokenPolicyRef,
      ),
    ]),
    (_) => new Error('Expected a single iasset token policy Ref Script UTXO'),
  );

  const cdpUtxo = matchSingle(
    await lucid.utxosByOutRef([cdpOref]),
    (_) => new Error('Expected a single cdp UTXO'),
  );
  const cdpDatum = parseCdpDatumOrThrow(getInlineDatumOrThrow(cdpUtxo));

  const iassetUtxo = matchSingle(
    await lucid.utxosByOutRef([iassetOref]),
    (_) => new Error('Expected a single iasset UTXO'),
  );
  const iassetDatum = parseIAssetDatumOrThrow(
    getInlineDatumOrThrow(iassetUtxo),
  );

  const govUtxo = matchSingle(
    await lucid.utxosByOutRef([govOref]),
    (_) => new Error('Expected a single gov UTXO'),
  );
  const govDatum = parseGovDatumOrThrow(getInlineDatumOrThrow(govUtxo));

  const priceOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([priceOracleOref]),
    (_) => new Error('Expected a single price oracle UTXO'),
  );
  const priceOracleDatum = parsePriceOracleDatum(
    getInlineDatumOrThrow(priceOracleUtxo),
  );

  const interestOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([interestOracleOref]),
    (_) => new Error('Expected a single interest oracle UTXO'),
  );
  const interestOracleDatum = parseInterestOracleDatum(
    getInlineDatumOrThrow(interestOracleUtxo),
  );

  const txValidity = oracleExpirationAwareValidity(
    currentSlot,
    Number(sysParams.cdpCreatorParams.biasTime),
    Number(priceOracleDatum.expiration),
    network,
  );

  const tx = lucid
    .newTx()
    .readFrom([
      cdpRefScriptUtxo,
      iAssetTokenPolicyRefScriptUtxo,
      cdpAuthTokenPolicyRefScriptUtxo,
    ])
    .readFrom([iassetUtxo, govUtxo, priceOracleUtxo, interestOracleUtxo])
    .validFrom(txValidity.validFrom)
    .validTo(txValidity.validTo)
    .mintAssets(
      mkAssetsOf(
        {
          currencySymbol: sysParams.cdpParams.cdpAssetSymbol.unCurrencySymbol,
          tokenName: iassetDatum.assetName,
        },
        -cdpDatum.mintedAmt,
      ),
      Data.void(),
    )
    .mintAssets(
      mkAssetsOf(fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken), -1n),
      Data.void(),
    )
    .collectFrom(
      [cdpUtxo],
      serialiseCdpRedeemer({ CloseCdp: { currentTime: currentTime } }),
    )
    .addSignerKey(pkh.hash);

  const interestAdaAmt = match(cdpDatum.cdpFees)
    .with({ FrozenCDPAccumulatedFees: P.any }, () => {
      throw new Error('CDP fees wrong');
    })
    .with({ ActiveCDPInterestTracking: P.select() }, (interest) => {
      const interestPaymentIAssetAmt = calculateAccruedInterest(
        currentTime,
        interest.unitaryInterestSnapshot,
        cdpDatum.mintedAmt,
        interest.lastSettled,
        interestOracleDatum,
      );

      return (
        (interestPaymentIAssetAmt * priceOracleDatum.price.getOnChainInt) /
        1_000_000n
      );
    })
    .exhaustive();

  const interestCollectorAdaAmt = calculateFeeFromPercentage(
    iassetDatum.interestCollectorPortionPercentage.getOnChainInt,
    interestAdaAmt,
  );
  const interestTreasuryAdaAmt = interestAdaAmt - interestCollectorAdaAmt;

  if (interestTreasuryAdaAmt > 0) {
    await TreasuryContract.feeTx(
      interestTreasuryAdaAmt,
      lucid,
      sysParams,
      tx,
      treasuryOref,
    );
  }

  const collectorFee =
    interestCollectorAdaAmt +
    calculateFeeFromPercentage(
      govDatum.protocolParams.collateralFeePercentage.getOnChainInt,
      lovelacesAmt(cdpUtxo.assets) - interestAdaAmt,
    );

  if (collectorFee > 0n) {
    await CollectorContract.feeTx(
      collectorFee,
      lucid,
      sysParams,
      tx,
      collectorOref,
    );
  }

  return tx;
}

export async function redeemCdp(
  attemptedRedemptionIAssetAmt: bigint,
  cdpOref: OutRef,
  iassetOref: OutRef,
  priceOracleOref: OutRef,
  interestOracleOref: OutRef,
  sysParams: SystemParams,
  lucid: LucidEvolution,
  currentSlot: number,
): Promise<TxBuilder> {
  const network = lucid.config().network!;
  // Find Pkh, Skh
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [pkh, _] = await addrDetails(lucid);
  const currentTime = BigInt(slotToUnixTime(network, currentSlot));

  const cdpRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(sysParams.scriptReferences.cdpValidatorRef),
    ]),
    (_) => new Error('Expected a single cdp Ref Script UTXO'),
  );

  const iAssetTokenPolicyRefScriptUtxo = matchSingle(
    await lucid.utxosByOutRef([
      fromSystemParamsScriptRef(
        sysParams.scriptReferences.iAssetTokenPolicyRef,
      ),
    ]),
    (_) => new Error('Expected a single iasset token policy Ref Script UTXO'),
  );

  const cdpUtxo = matchSingle(
    await lucid.utxosByOutRef([cdpOref]),
    (_) => new Error('Expected a single cdp UTXO'),
  );
  const cdpDatum = parseCdpDatumOrThrow(getInlineDatumOrThrow(cdpUtxo));

  const iassetUtxo = matchSingle(
    await lucid.utxosByOutRef([iassetOref]),
    (_) => new Error('Expected a single iasset UTXO'),
  );
  const iassetDatum = parseIAssetDatumOrThrow(
    getInlineDatumOrThrow(iassetUtxo),
  );

  const priceOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([priceOracleOref]),
    (_) => new Error('Expected a single price oracle UTXO'),
  );
  const priceOracleDatum = parsePriceOracleDatum(
    getInlineDatumOrThrow(priceOracleUtxo),
  );

  const interestOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([interestOracleOref]),
    (_) => new Error('Expected a single interest oracle UTXO'),
  );
  const interestOracleDatum = parseInterestOracleDatum(
    getInlineDatumOrThrow(interestOracleUtxo),
  );

  const interestAdaAmt = match(cdpDatum.cdpFees)
    .with({ FrozenCDPAccumulatedFees: P.any }, () => {
      throw new Error('CDP fees wrong');
    })
    .with({ ActiveCDPInterestTracking: P.select() }, (interest) => {
      const interestPaymentIAssetAmt = calculateAccruedInterest(
        currentTime,
        interest.unitaryInterestSnapshot,
        cdpDatum.mintedAmt,
        interest.lastSettled,
        interestOracleDatum,
      );

      return (
        (interestPaymentIAssetAmt * priceOracleDatum.price.getOnChainInt) /
        1_000_000n
      );
    })
    .exhaustive();

  const collateralAmtMinusInterest =
    lovelacesAmt(cdpUtxo.assets) - interestAdaAmt;

  const [isPartial, redemptionIAssetAmt] = (() => {
    const res = calculateMinCollateralCappedIAssetRedemptionAmt(
      collateralAmtMinusInterest,
      cdpDatum.mintedAmt,
      priceOracleDatum.price,
      iassetDatum.redemptionRatio,
      iassetDatum.redemptionReimbursementPercentage,
      BigInt(sysParams.cdpParams.minCollateralInLovelace),
    );

    const redemptionAmt = bigintMin(
      attemptedRedemptionIAssetAmt,
      res.cappedIAssetRedemptionAmt,
    );

    return [redemptionAmt < res.cappedIAssetRedemptionAmt, redemptionAmt];
  })();

  const redemptionLovelacesAmt = ocdMul(priceOracleDatum.price, {
    getOnChainInt: redemptionIAssetAmt,
  }).getOnChainInt;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const partialRedemptionFee = isPartial
    ? sysParams.cdpParams.partialRedemptionExtraFeeLovelace
    : 0n;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const processingFee = calculateFeeFromPercentage(
    iassetDatum.redemptionProcessingFeePercentage.getOnChainInt,
    redemptionLovelacesAmt,
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const reimburstmentFee = calculateFeeFromPercentage(
    iassetDatum.redemptionReimbursementPercentage.getOnChainInt,
    redemptionLovelacesAmt,
  );

  const txValidity = oracleExpirationAwareValidity(
    currentSlot,
    Number(sysParams.cdpCreatorParams.biasTime),
    Number(priceOracleDatum.expiration),
    network,
  );

  const tx = lucid
    .newTx()
    .readFrom([cdpRefScriptUtxo, iAssetTokenPolicyRefScriptUtxo])
    .validFrom(txValidity.validFrom)
    .validTo(txValidity.validTo)
    .collectFrom(
      [cdpUtxo],
      serialiseCdpRedeemer({ RedeemCdp: { currentTime: currentTime } }),
    )
    .mintAssets(
      mkAssetsOf(
        {
          currencySymbol: sysParams.cdpParams.cdpAssetSymbol.unCurrencySymbol,
          tokenName: iassetDatum.assetName,
        },
        -cdpDatum.mintedAmt,
      ),
      Data.void(),
    );

  return tx;
}
