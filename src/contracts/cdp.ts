import {
  addAssets,
  applyParamsToScript,
  Assets,
  Constr,
  Credential,
  Data,
  fromText,
  LucidEvolution,
  OutRef,
  slotToUnixTime,
  SpendingValidator,
  TxBuilder,
  UTxO,
  validatorToAddress,
  validatorToScriptHash,
} from '@lucid-evolution/lucid';
import {
  CdpParams,
  fromSystemParamsAsset,
  fromSystemParamsScriptRef,
  ScriptReferences,
  SystemParams,
} from '../types/system-params';
import { IAssetHelpers } from '../helpers/asset-helpers';
import { CollectorContract } from './collector';
import { TreasuryContract } from './treasury';
import {
  addrDetails,
  createScriptAddress,
  getInlineDatumOrThrow,
  scriptRef,
} from '../helpers/lucid-utils';
import { calculateFeeFromPercentage, matchSingle } from '../helpers/helpers';
import {
  CDPContent,
  parseCDPDatum,
  parseIAssetDatumOrThrow,
  serialiseCDPDatum,
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
import { mkAssetsOf, mkLovelacesOf } from '../helpers/value-helpers';

export async function openCdp(
  collateralAmount: bigint,
  mintedAmount: bigint,
  sysParams: SystemParams,
  cdpCreatorRef: OutRef,
  iassetOref: OutRef,
  priceOracleOref: OutRef,
  interestOracleRef: OutRef,
  collectorRef: OutRef,
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
    (_) => new Error('Expected a single cdp auth token policy Ref Script UTXO'),
  );

  const iassetUtxo = matchSingle(
    await lucid.utxosByOutRef([iassetOref]),
    (_) => new Error('Expected a single iasset UTXO'),
  );

  const iassetDatum = parseIAssetDatumOrThrow(
    getInlineDatumOrThrow(iassetUtxo),
  );

  match(iassetDatum.price)
    .with({ Delisted: P.any }, () => {
      throw new Error('Trying to open CDP against delisted asset');
    })
    .otherwise(() => {});

  const priceOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([priceOracleOref]),
    (_) => new Error('Expected a single price oracle UTXO'),
  );

  const priceOracleDatum = parsePriceOracleDatum(
    getInlineDatumOrThrow(priceOracleUtxo),
  );

  const interestOracleUtxo = matchSingle(
    await lucid.utxosByOutRef([interestOracleRef]),
    (_) => new Error('Expected a single interest oracle UTXO'),
  );

  const interestOracleDatum = parseInterestOracleDatum(
    getInlineDatumOrThrow(interestOracleUtxo),
  );

  const cdpCreatorUtxo = matchSingle(
    await lucid.utxosByOutRef([cdpCreatorRef]),
    (_) => new Error('Expected a single CDP creator UTXO'),
  );

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
        value: serialiseCDPDatum({
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
      collectorRef,
    );
  }

  return tx;
}

export class CDPContract {
  static async deposit(
    cdpRef: OutRef,
    amount: bigint,
    params: SystemParams,
    lucid: LucidEvolution,
    currentSlot: number,
    assetRef?: OutRef,
    priceOracleRef?: OutRef,
    interestOracleRef?: OutRef,
    collectorRef?: OutRef,
    govRef?: OutRef,
    treasuryRef?: OutRef,
  ): Promise<TxBuilder> {
    return CDPContract.adjust(
      cdpRef,
      amount,
      0n,
      params,
      lucid,
      currentSlot,
      assetRef,
      priceOracleRef,
      interestOracleRef,
      collectorRef,
      govRef,
      treasuryRef,
    );
  }

  static async withdraw(
    cdpRef: OutRef,
    amount: bigint,
    params: SystemParams,
    lucid: LucidEvolution,
    currentSlot: number,
    assetRef?: OutRef,
    priceOracleRef?: OutRef,
    interestOracleRef?: OutRef,
    collectorRef?: OutRef,
    govRef?: OutRef,
    treasuryRef?: OutRef,
  ): Promise<TxBuilder> {
    return CDPContract.adjust(
      cdpRef,
      -amount,
      0n,
      params,
      lucid,
      currentSlot,
      assetRef,
      priceOracleRef,
      interestOracleRef,
      collectorRef,
      govRef,
      treasuryRef,
    );
  }

  static async mint(
    cdpRef: OutRef,
    amount: bigint,
    params: SystemParams,
    lucid: LucidEvolution,
    currentSlot: number,
    assetRef?: OutRef,
    priceOracleRef?: OutRef,
    interestOracleRef?: OutRef,
    collectorRef?: OutRef,
    govRef?: OutRef,
    treasuryRef?: OutRef,
  ): Promise<TxBuilder> {
    return CDPContract.adjust(
      cdpRef,
      0n,
      amount,
      params,
      lucid,
      currentSlot,
      assetRef,
      priceOracleRef,
      interestOracleRef,
      collectorRef,
      govRef,
      treasuryRef,
    );
  }

  static async burn(
    cdpRef: OutRef,
    amount: bigint,
    params: SystemParams,
    lucid: LucidEvolution,
    currentSlot: number,
    assetRef?: OutRef,
    priceOracleRef?: OutRef,
    interestOracleRef?: OutRef,
    collectorRef?: OutRef,
    govRef?: OutRef,
    treasuryRef?: OutRef,
  ): Promise<TxBuilder> {
    return CDPContract.adjust(
      cdpRef,
      0n,
      -amount,
      params,
      lucid,
      currentSlot,
      assetRef,
      priceOracleRef,
      interestOracleRef,
      collectorRef,
      govRef,
      treasuryRef,
    );
  }

  static async adjust(
    cdpRef: OutRef,
    collateralAmount: bigint,
    mintAmount: bigint,
    params: SystemParams,
    lucid: LucidEvolution,
    currentSlot: number,
    assetRef?: OutRef,
    priceOracleRef?: OutRef,
    interestOracleRef?: OutRef,
    collectorRef?: OutRef,
    govRef?: OutRef,
    treasuryRef?: OutRef,
  ): Promise<TxBuilder> {
    const network = lucid.config().network!;
    // Find Pkh, Skh
    const [pkh, _] = await addrDetails(lucid);
    const currentTime = BigInt(slotToUnixTime(network, currentSlot));

    // Find Outputs: iAsset Output, CDP Output, Gov Output
    const cdp = (await lucid.utxosByOutRef([cdpRef]))[0];
    if (!cdp.datum) throw new Error('Unable to find CDP Datum');
    const cdpDatum = parseCDPDatum(cdp.datum);
    const iAsset = await (assetRef
      ? IAssetHelpers.findIAssetByRef(assetRef, lucid)
      : IAssetHelpers.findIAssetByName(cdpDatum.iasset, params, lucid));

    const gov = govRef
      ? (await lucid.utxosByOutRef([govRef]))[0]
      : await lucid.utxoByUnit(
          params.govParams.govNFT[0].unCurrencySymbol +
            fromText(params.govParams.govNFT[1].unTokenName),
        );
    if (!gov.datum) throw new Error('Unable to find Gov Datum');
    const govData = parseGovDatumOrThrow(gov.datum);
    const cdpScriptRefUtxo = await CDPContract.scriptRef(
      params.scriptReferences,
      lucid,
    );
    const cdpAssets = Object.assign({}, cdp.assets);
    cdpAssets['lovelace'] = cdp.assets['lovelace'] + collateralAmount;

    const interestOracleAsset = iAsset.datum.interestOracleNft;
    const interestOracleOut = interestOracleRef
      ? (await lucid.utxosByOutRef([interestOracleRef]))[0]
      : await lucid.utxoByUnit(
          interestOracleAsset.currencySymbol +
            fromText(interestOracleAsset.tokenName),
        );
    if (!interestOracleOut.datum)
      return Promise.reject(new Error('Interest Oracle datum not found'));
    const interestOracleDatum = parseInterestOracleDatum(
      interestOracleOut.datum,
    );

    const tx = lucid
      .newTx()
      .collectFrom(
        [cdp],
        Data.to(new Constr(0, [currentTime, mintAmount, collateralAmount])),
      )
      .readFrom([iAsset.utxo, gov, cdpScriptRefUtxo])
      .addSignerKey(pkh.hash);
    if (!cdp.datum) throw new Error('Unable to find CDP Datum');
    const cdpD = parseCDPDatum(cdp.datum);

    if (!('ActiveCDPInterestTracking' in cdpD.cdpFees))
      throw new Error('Invalid CDP Fees');

    const newSnapshot =
      calculateUnitaryInterestSinceOracleLastUpdated(
        currentTime,
        interestOracleDatum,
      ) + interestOracleDatum.unitaryInterest;

    const cdpD_: CDPContent = {
      ...cdpD,
      mintedAmt: cdpD.mintedAmt + mintAmount,
      cdpFees: {
        ActiveCDPInterestTracking: {
          lastSettled: currentTime,
          unitaryInterestSnapshot: newSnapshot,
        },
      },
    };

    tx.pay.ToContract(
      cdp.address,
      {
        kind: 'inline',
        value: serialiseCDPDatum(cdpD_),
      },
      cdpAssets,
    );

    // Find Oracle Ref Input
    const oracleAsset = iAsset.datum.price;
    if (!('Oracle' in oracleAsset)) throw new Error('Invalid oracle asset');
    const oracleRefInput = priceOracleRef
      ? (await lucid.utxosByOutRef([priceOracleRef]))[0]
      : await lucid.utxoByUnit(
          oracleAsset.Oracle.content.oracleNft.currencySymbol +
            fromText(oracleAsset.Oracle.content.oracleNft.tokenName),
        );

    // Fail if delisted asset
    if (!oracleRefInput.datum)
      return Promise.reject(new Error('Invalid oracle input'));
    const od = parsePriceOracleDatum(oracleRefInput.datum);
    if (!od) return Promise.reject(new Error('Invalid oracle input'));

    const txValidity = oracleExpirationAwareValidity(
      currentSlot,
      Number(params.cdpCreatorParams.biasTime),
      Number(od.expiration),
      network,
    );
    tx.readFrom([oracleRefInput])
      .validFrom(txValidity.validFrom)
      .validTo(txValidity.validTo);

    let fee = 0n;
    if (collateralAmount < 0) {
      fee += calculateFeeFromPercentage(
        govData.protocolParams.collateralFeePercentage.getOnChainInt,
        collateralAmount,
      );
    }

    if (mintAmount > 0) {
      fee += calculateFeeFromPercentage(
        iAsset.datum.debtMintingFeePercentage.getOnChainInt,
        (mintAmount * od.price.getOnChainInt) / 1_000_000n,
      );
    }

    // Interest payment

    const interestPaymentAsset = calculateAccruedInterest(
      currentTime,
      cdpD.cdpFees.ActiveCDPInterestTracking.unitaryInterestSnapshot,
      cdpD.mintedAmt,
      cdpD.cdpFees.ActiveCDPInterestTracking.lastSettled,
      interestOracleDatum,
    );
    const interestPayment =
      (interestPaymentAsset * od.price.getOnChainInt) / 1_000_000n;
    const interestCollectorPayment = calculateFeeFromPercentage(
      iAsset.datum.interestCollectorPortionPercentage.getOnChainInt,
      interestPayment,
    );
    const interestTreasuryPayment = interestPayment - interestCollectorPayment;

    if (interestTreasuryPayment > 0) {
      await TreasuryContract.feeTx(
        interestTreasuryPayment,
        lucid,
        params,
        tx,
        treasuryRef,
      );
    }

    fee += interestCollectorPayment;
    tx.readFrom([interestOracleOut]);

    if (mintAmount !== 0n) {
      const iAssetTokenScriptRefUtxo = await CDPContract.assetTokenRef(
        params.scriptReferences,
        lucid,
      );
      const iassetToken =
        params.cdpParams.cdpAssetSymbol.unCurrencySymbol + cdpD.iasset;
      const mintValue = {} as Assets;
      mintValue[iassetToken] = mintAmount;

      tx.readFrom([iAssetTokenScriptRefUtxo]).mintAssets(
        mintValue,
        Data.to(new Constr(0, [])),
      );
    }

    if (fee > 0n) {
      await CollectorContract.feeTx(fee, lucid, params, tx, collectorRef);
    }

    return tx;
  }

  static async close(
    cdpRef: OutRef,
    params: SystemParams,
    lucid: LucidEvolution,
    currentSlot: number,
    assetRef?: OutRef,
    priceOracleRef?: OutRef,
    interestOracleRef?: OutRef,
    collectorRef?: OutRef,
    govRef?: OutRef,
    treasuryRef?: OutRef,
  ): Promise<TxBuilder> {
    const network = lucid.config().network!;
    // Find Pkh, Skh
    const [pkh, _] = await addrDetails(lucid);
    const currentTime = BigInt(slotToUnixTime(network, currentSlot));

    // Find Outputs: iAsset Output, CDP Output, Gov Output
    const cdp = (await lucid.utxosByOutRef([cdpRef]))[0];
    if (!cdp.datum) throw new Error('Unable to find CDP Datum');
    const cdpDatum = parseCDPDatum(cdp.datum);
    const iAsset = await (assetRef
      ? IAssetHelpers.findIAssetByRef(assetRef, lucid)
      : IAssetHelpers.findIAssetByName(cdpDatum.iasset, params, lucid));

    const gov = govRef
      ? (await lucid.utxosByOutRef([govRef]))[0]
      : await lucid.utxoByUnit(
          params.govParams.govNFT[0].unCurrencySymbol +
            fromText(params.govParams.govNFT[1].unTokenName),
        );

    if (!gov.datum) throw new Error('Unable to find Gov Datum');
    const cdpScriptRefUtxo = await CDPContract.scriptRef(
      params.scriptReferences,
      lucid,
    );

    const interestOracleAsset = iAsset.datum.interestOracleNft;
    const interestOracleOut = interestOracleRef
      ? (await lucid.utxosByOutRef([interestOracleRef]))[0]
      : await lucid.utxoByUnit(
          interestOracleAsset.currencySymbol +
            fromText(interestOracleAsset.tokenName),
        );
    if (!interestOracleOut.datum)
      return Promise.reject(new Error('Interest Oracle datum not found'));
    const interestOracleDatum = parseInterestOracleDatum(
      interestOracleOut.datum,
    );

    const tx = lucid
      .newTx()
      .collectFrom([cdp], Data.to(new Constr(1, [currentTime])))
      .readFrom([iAsset.utxo, gov, cdpScriptRefUtxo])
      .addSignerKey(pkh.hash);
    if (!cdp.datum) throw new Error('Unable to find CDP Datum');
    const cdpD = parseCDPDatum(cdp.datum);
    if (!('ActiveCDPInterestTracking' in cdpD.cdpFees))
      throw new Error('Invalid CDP Fees');

    // Find Oracle Ref Input
    if (!('Oracle' in iAsset.datum.price))
      throw new Error('iAsset is delisted');
    const oracleAsset = iAsset.datum.price.Oracle.content.oracleNft;
    const oracleRefInput = priceOracleRef
      ? (await lucid.utxosByOutRef([priceOracleRef]))[0]
      : await lucid.utxoByUnit(
          oracleAsset.currencySymbol + fromText(oracleAsset.tokenName),
        );

    // Fail if delisted asset
    if (!oracleRefInput.datum)
      return Promise.reject(new Error('Invalid oracle input'));
    const od = parsePriceOracleDatum(oracleRefInput.datum);

    const txValidity = oracleExpirationAwareValidity(
      currentSlot,
      Number(params.cdpCreatorParams.biasTime),
      Number(od.expiration),
      network,
    );
    tx.readFrom([oracleRefInput])
      .validFrom(txValidity.validFrom)
      .validTo(txValidity.validTo);

    let fee = 0n;

    // Interest payment
    const interestPaymentAsset = calculateAccruedInterest(
      currentTime,
      cdpD.cdpFees.ActiveCDPInterestTracking.unitaryInterestSnapshot,
      cdpD.mintedAmt,
      cdpD.cdpFees.ActiveCDPInterestTracking.lastSettled,
      interestOracleDatum,
    );
    const interestPayment =
      (interestPaymentAsset * od.price.getOnChainInt) / 1_000_000n;
    const interestCollectorPayment = calculateFeeFromPercentage(
      iAsset.datum.interestCollectorPortionPercentage.getOnChainInt,
      interestPayment,
    );
    const interestTreasuryPayment = interestPayment - interestCollectorPayment;

    if (interestTreasuryPayment > 0) {
      await TreasuryContract.feeTx(
        interestTreasuryPayment,
        lucid,
        params,
        tx,
        treasuryRef,
      );
    }

    fee += interestCollectorPayment;
    tx.readFrom([interestOracleOut]);

    const iAssetTokenScriptRefUtxo = await CDPContract.assetTokenRef(
      params.scriptReferences,
      lucid,
    );
    const iassetToken =
      params.cdpParams.cdpAssetSymbol.unCurrencySymbol + cdpD.iasset;
    const assetBurnValue = {} as Assets;
    assetBurnValue[iassetToken] = -BigInt(cdpD.mintedAmt);
    const cdpTokenBurnValue = {} as Assets;
    cdpTokenBurnValue[
      params.cdpParams.cdpAuthToken[0].unCurrencySymbol +
        fromText(params.cdpParams.cdpAuthToken[1].unTokenName)
    ] = -1n;
    const cdpAuthTokenScriptRefUtxo = await CDPContract.cdpAuthTokenRef(
      params.scriptReferences,
      lucid,
    );
    tx.readFrom([iAssetTokenScriptRefUtxo])
      .mintAssets(assetBurnValue, Data.to(new Constr(0, [])))
      .readFrom([cdpAuthTokenScriptRefUtxo])
      .mintAssets(cdpTokenBurnValue, Data.to(new Constr(0, [])));

    if (fee > 0n) {
      await CollectorContract.feeTx(fee, lucid, params, tx, collectorRef);
    }

    return tx;
  }

  static validator(params: CdpParams): SpendingValidator {
    return {
      type: _cdpValidator.type,
      script: applyParamsToScript(_cdpValidator.cborHex, [
        new Constr(0, [
          new Constr(0, [
            params.cdpAuthToken[0].unCurrencySymbol,
            fromText(params.cdpAuthToken[1].unTokenName),
          ]),
          params.cdpAssetSymbol.unCurrencySymbol,
          new Constr(0, [
            params.iAssetAuthToken[0].unCurrencySymbol,
            fromText(params.iAssetAuthToken[1].unTokenName),
          ]),
          new Constr(0, [
            params.stabilityPoolAuthToken[0].unCurrencySymbol,
            fromText(params.stabilityPoolAuthToken[1].unTokenName),
          ]),
          new Constr(0, [
            params.versionRecordToken[0].unCurrencySymbol,
            fromText(params.versionRecordToken[1].unTokenName),
          ]),
          new Constr(0, [
            params.upgradeToken[0].unCurrencySymbol,
            fromText(params.upgradeToken[1].unTokenName),
          ]),
          params.collectorValHash,
          params.spValHash,
          new Constr(0, [
            params.govNFT[0].unCurrencySymbol,
            fromText(params.govNFT[1].unTokenName),
          ]),
          BigInt(params.minCollateralInLovelace),
          BigInt(params.partialRedemptionExtraFeeLovelace),
          BigInt(params.biasTime),
          params.treasuryValHash,
        ]),
      ]),
    };
  }

  static validatorHash(params: CdpParams): string {
    return validatorToScriptHash(CDPContract.validator(params));
  }

  static address(
    cdpParams: CdpParams,
    lucid: LucidEvolution,
    skh?: Credential,
  ) {
    const network = lucid.config().network;
    if (!network) {
      throw new Error('Network configuration is undefined');
    }
    return validatorToAddress(network, CDPContract.validator(cdpParams), skh);
  }

  static scriptRef(
    params: ScriptReferences,
    lucid: LucidEvolution,
  ): Promise<UTxO> {
    return scriptRef(params.cdpValidatorRef, lucid);
  }

  static cdpAuthTokenRef(
    params: ScriptReferences,
    lucid: LucidEvolution,
  ): Promise<UTxO> {
    return scriptRef(params.authTokenPolicies.cdpAuthTokenRef, lucid);
  }

  static assetTokenRef(
    params: ScriptReferences,
    lucid: LucidEvolution,
  ): Promise<UTxO> {
    return scriptRef(params.iAssetTokenPolicyRef, lucid);
  }

  static assetAuthTokenRef(
    params: ScriptReferences,
    lucid: LucidEvolution,
  ): Promise<UTxO> {
    return scriptRef(params.authTokenPolicies.iAssetTokenRef, lucid);
  }
}
