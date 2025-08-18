import {
  applyParamsToScript,
  Assets,
  Constr,
  Credential,
  Data,
  fromText,
  LucidEvolution,
  OutRef,
  SpendingValidator,
  toText,
  TxBuilder,
  UTxO,
  validatorToAddress,
  validatorToScriptHash,
} from '@lucid-evolution/lucid';
import {
  CdpParams,
  ScriptReferences,
  SystemParams,
} from '../types/system-params';
import { IAssetHelpers, IAssetOutput } from '../helpers/asset-helpers';
import { CDPCreatorContract } from './cdp-creator';
import { CollectorContract } from './collector';
import { InterestOracleContract } from './interest-oracle';
import { GovContract } from './gov';
import { TreasuryContract } from './treasury';
import { addrDetails, scriptRef } from '../helpers/lucid-utils';
import { AssetClass } from '../types/generic';
import {
  calculateFeeFromPercentage,
  getRandomElement,
} from '../helpers/helpers';
import {
  CDPContent,
  CDPDatum,
  CDPDatumSchema,
  CDPFees,
  parseCDPDatum,
  serialiseCDPDatum,
} from '../types/indigo/cdp';
import { _cdpValidator } from '../scripts/cdp-validator';
import { parsePriceOracleDatum } from '../types/indigo/price-oracle';
import { parseInterestOracleDatum } from '../types/indigo/interest-oracle';

export class CDPContract {
  static async openPosition(
    asset: string,
    collateralAmount: bigint,
    mintedAmount: bigint,
    params: SystemParams,
    lucid: LucidEvolution,
    assetRef?: OutRef,
    priceOracleRef?: OutRef,
    interestOracleRef?: OutRef,
    cdpCreatorRef?: OutRef,
    collectorRef?: OutRef,
    now: number = Date.now(),
  ): Promise<TxBuilder> {
    const [pkh, skh] = await addrDetails(lucid);
    const assetOut: IAssetOutput = await (assetRef
      ? IAssetHelpers.findIAssetByRef(assetRef, lucid)
      : IAssetHelpers.findIAssetByName(asset, params, lucid));
    if (!assetOut || !assetOut.datum) throw 'Unable to find IAsset';
    // Fail if delisted asset
    if ('Delisted' in assetOut.datum.price)
      return Promise.reject('Trying to open CDP against delisted asset');

    const oracleAsset = assetOut.datum.price.Oracle.oracleNft.asset;
    const oracleOut = priceOracleRef
      ? (await lucid.utxosByOutRef([priceOracleRef]))[0]
      : await lucid.utxoByUnit(
          oracleAsset.currencySymbol + oracleAsset.tokenName,
        );
    if (!oracleOut.datum) return Promise.reject('Price Oracle datum not found');
    const oracleDatum = parsePriceOracleDatum(oracleOut.datum);

    const interestOracleAsset = assetOut.datum.interestOracleNft;
    const interestOracleOut = interestOracleRef
      ? (await lucid.utxosByOutRef([interestOracleRef]))[0]
      : await lucid.utxoByUnit(
          interestOracleAsset.currencySymbol + interestOracleAsset.tokenName,
        );
    if (!interestOracleOut.datum)
      return Promise.reject('Interest Oracle datum not found');
    const interestOracleDatum = parseInterestOracleDatum(
      interestOracleOut.datum,
    );

    const cdpCreatorOut = getRandomElement(
      cdpCreatorRef
        ? await lucid.utxosByOutRef([cdpCreatorRef])
        : await lucid.utxosAtWithUnit(
            CDPCreatorContract.address(params.cdpCreatorParams, lucid),
            params.cdpCreatorParams.cdpCreatorNft[0].unCurrencySymbol +
              fromText(params.cdpCreatorParams.cdpCreatorNft[1].unTokenName),
          ),
    );
    const cdpCreatorRedeemer = CDPCreatorContract.redeemer(
      pkh,
      mintedAmount,
      collateralAmount,
      BigInt(now),
    );
    const cdpCreatorScriptRefUtxo = await CDPCreatorContract.scriptRef(
      params.scriptReferences,
      lucid,
    );

    const cdpAddress = CDPContract.address(params.cdpParams, lucid, skh);
    const cdpToken =
      params.cdpParams.cdpAuthToken[0].unCurrencySymbol +
      fromText(params.cdpParams.cdpAuthToken[1].unTokenName);

    const cdpValue: Assets = {
      lovelace: collateralAmount,
    };
    cdpValue[cdpToken] = 1n;
    const newSnapshot =
      InterestOracleContract.calculateUnitaryInterestSinceOracleLastUpdated(
        BigInt(now),
        interestOracleDatum,
      ) + interestOracleDatum.unitaryInterest;
    const cdpDatum: CDPContent = {
      cdpOwner: pkh.hash,
      iasset: fromText(asset),
      mintedAmt: mintedAmount,
      cdpFees: {
        ActiveCDPInterestTracking: {
          lastSettled: BigInt(now),
          unitaryInterestSnapshot: newSnapshot,
        },
      },
    };

    const assetToken =
      params.cdpParams.cdpAssetSymbol.unCurrencySymbol + fromText(asset);
    const cdpTokenMintValue: Assets = {};
    cdpTokenMintValue[cdpToken] = 1n;
    const iassetTokenMintValue: Assets = {};
    iassetTokenMintValue[assetToken] = BigInt(mintedAmount);

    const cdpAuthTokenScriptRefUtxo = await CDPContract.cdpAuthTokenRef(
      params.scriptReferences,
      lucid,
    );
    const iAssetTokenScriptRefUtxo = await CDPContract.assetTokenRef(
      params.scriptReferences,
      lucid,
    );

    const debtMintingFee = calculateFeeFromPercentage(
      BigInt(assetOut.datum.debtMintingFeePercentage.getOnChainInt),
      (mintedAmount * oracleDatum.price.getOnChainInt) / 1_000_000n,
    );

    // Oracle timestamp - 20s (length of a slot)
    const cappedValidateTo = oracleDatum.expiration - 20_001n;
    const timeValidFrom = now - 1_000;
    const timeValidTo_ = now + params.cdpCreatorParams.biasTime - 1_000;
    const timeValidTo =
      cappedValidateTo <= timeValidFrom
        ? timeValidTo_
        : Math.min(timeValidTo_, Number(cappedValidateTo));

    const tx = lucid
      .newTx()
      .collectFrom([cdpCreatorOut], Data.to(cdpCreatorRedeemer))
      .readFrom([cdpCreatorScriptRefUtxo])
      .pay.ToContract(
        cdpAddress,
        { kind: 'inline', value: serialiseCDPDatum(cdpDatum) },
        cdpValue,
      )
      .pay.ToContract(
        cdpCreatorOut.address,
        { kind: 'inline', value: cdpCreatorOut.datum },
        cdpCreatorOut.assets,
      )
      .readFrom([oracleOut, interestOracleOut, assetOut.utxo])
      .mintAssets(cdpTokenMintValue, Data.to(new Constr(0, [])))
      .readFrom([cdpAuthTokenScriptRefUtxo])
      .mintAssets(iassetTokenMintValue, Data.to(new Constr(0, [])))
      .readFrom([iAssetTokenScriptRefUtxo])
      .addSignerKey(pkh.hash)
      .validFrom(Number(now - 100))
      .validTo(Number(timeValidTo));

    if (debtMintingFee > 0) {
      await CollectorContract.feeTx(
        debtMintingFee,
        lucid,
        params,
        tx,
        collectorRef,
      );
    }
    return tx;
  }

  static async deposit(
    cdpRef: OutRef,
    amount: bigint,
    params: SystemParams,
    lucid: LucidEvolution,
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
    assetRef?: OutRef,
    priceOracleRef?: OutRef,
    interestOracleRef?: OutRef,
    collectorRef?: OutRef,
    govRef?: OutRef,
    treasuryRef?: OutRef,
  ): Promise<TxBuilder> {
    // Find Pkh, Skh
    const [pkh, skh] = await addrDetails(lucid);
    const now = Date.now();

    // Fail if no pkh
    if (!pkh)
      return Promise.reject(
        'Unable to determine the pub key hash of the wallet',
      );

    // Find Outputs: iAsset Output, CDP Output, Gov Output
    const cdp = (await lucid.utxosByOutRef([cdpRef]))[0];
    if (!cdp.datum) throw 'Unable to find CDP Datum';
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
    if (!gov.datum) throw 'Unable to find Gov Datum';
    const govData = GovContract.decodeGovDatum(gov.datum);
    if (!govData) throw 'No Governance datum found';
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
      return Promise.reject('Interest Oracle datum not found');
    const interestOracleDatum = parseInterestOracleDatum(
      interestOracleOut.datum,
    );

    const tx = lucid
      .newTx()
      .collectFrom(
        [cdp],
        Data.to(new Constr(0, [BigInt(now), mintAmount, collateralAmount])),
      )
      .readFrom([iAsset.utxo, gov, cdpScriptRefUtxo])
      .addSignerKey(pkh.hash);
    if (!cdp.datum) throw 'Unable to find CDP Datum';
    const cdpD = parseCDPDatum(cdp.datum);

    if (!('ActiveCDPInterestTracking' in cdpD.cdpFees))
      throw 'Invalid CDP Fees';

    const newSnapshot =
      InterestOracleContract.calculateUnitaryInterestSinceOracleLastUpdated(
        BigInt(now),
        interestOracleDatum,
      ) + interestOracleDatum.unitaryInterest;

    const cdpD_: CDPContent = {
      ...cdpD,
      mintedAmt: cdpD.mintedAmt + mintAmount,
      cdpFees: {
        ActiveCDPInterestTracking: {
          lastSettled: BigInt(now),
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
    if (!('Oracle' in oracleAsset)) throw 'Invalid oracle asset';
    const oracleRefInput = priceOracleRef
      ? (await lucid.utxosByOutRef([priceOracleRef]))[0]
      : await lucid.utxoByUnit(
          oracleAsset.Oracle.oracleNft.asset.currencySymbol +
            fromText(oracleAsset.Oracle.oracleNft.asset.tokenName),
        );

    // Fail if delisted asset
    if (!oracleRefInput.datum) return Promise.reject('Invalid oracle input');
    const od = parsePriceOracleDatum(oracleRefInput.datum);
    if (!od) return Promise.reject('Invalid oracle input');

    // TODO: Sanity check: oacle expiration
    // Oracle timestamp - 20s (length of a slot)
    // Oracle timestamp - 20s (length of a slot)
    const cappedValidateTo = od.expiration - 20_001n;
    const timeValidFrom = now - 1_000;
    const timeValidTo_ = now + params.cdpCreatorParams.biasTime - 1_000;
    const timeValidTo =
      cappedValidateTo <= timeValidFrom
        ? timeValidTo_
        : Math.min(timeValidTo_, Number(cappedValidateTo));
    tx.readFrom([oracleRefInput])
      .validFrom(Number(timeValidFrom))
      .validTo(Number(timeValidTo));

    let fee = 0n;
    if (collateralAmount < 0) {
      fee += calculateFeeFromPercentage(
        govData.protocolParams.collateralFeePercentage,
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

    const interestPaymentAsset =
      InterestOracleContract.calculateAccruedInterest(
        BigInt(now),
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
    console.log(
      interestPayment,
      interestCollectorPayment,
      interestTreasuryPayment,
    );
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
    assetRef?: OutRef,
    priceOracleRef?: OutRef,
    interestOracleRef?: OutRef,
    collectorRef?: OutRef,
    govRef?: OutRef,
    treasuryRef?: OutRef,
  ): Promise<TxBuilder> {
    // Find Pkh, Skh
    const [pkh, skh] = await addrDetails(lucid);
    const now = Date.now();

    // Fail if no pkh
    if (!pkh)
      return Promise.reject(
        'Unable to determine the pub key hash of the wallet',
      );

    // Find Outputs: iAsset Output, CDP Output, Gov Output
    const cdp = (await lucid.utxosByOutRef([cdpRef]))[0];
    if (!cdp.datum) throw 'Unable to find CDP Datum';
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

    if (!gov.datum) throw 'Unable to find Gov Datum';
    const govData = GovContract.decodeGovDatum(gov.datum);
    if (!govData) throw 'No Governance datum found';
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
      return Promise.reject('Interest Oracle datum not found');
    const interestOracleDatum = parseInterestOracleDatum(
      interestOracleOut.datum,
    );

    const tx = lucid
      .newTx()
      .collectFrom([cdp], Data.to(new Constr(1, [BigInt(now)])))
      .readFrom([iAsset.utxo, gov, cdpScriptRefUtxo])
      .addSignerKey(pkh.hash);
    if (!cdp.datum) throw 'Unable to find CDP Datum';
    const cdpD = parseCDPDatum(cdp.datum);
    if (!('ActiveCDPInterestTracking' in cdpD.cdpFees))
      throw 'Invalid CDP Fees';

    // Find Oracle Ref Input
    if (!('Oracle' in iAsset.datum.price)) throw 'iAsset is delisted';
    const oracleAsset = iAsset.datum.price.Oracle.oracleNft.asset;
    const oracleRefInput = priceOracleRef
      ? (await lucid.utxosByOutRef([priceOracleRef]))[0]
      : await lucid.utxoByUnit(
          oracleAsset.currencySymbol + fromText(oracleAsset.tokenName),
        );

    // Fail if delisted asset
    if (!oracleRefInput.datum) return Promise.reject('Invalid oracle input');
    const od = parsePriceOracleDatum(oracleRefInput.datum);

    // TODO: Sanity check: oacle expiration
    // Oracle timestamp - 20s (length of a slot)
    // Oracle timestamp - 20s (length of a slot)
    const cappedValidateTo = od.expiration - 20_001n;
    const timeValidFrom = now - 1_000;
    const timeValidTo_ = now + params.cdpCreatorParams.biasTime - 1_000;
    const timeValidTo =
      cappedValidateTo <= timeValidFrom
        ? timeValidTo_
        : Math.min(timeValidTo_, Number(cappedValidateTo));
    tx.readFrom([oracleRefInput])
      .validFrom(Number(timeValidFrom))
      .validTo(Number(timeValidTo));

    let fee = 0n;

    // Interest payment
    const interestPaymentAsset =
      InterestOracleContract.calculateAccruedInterest(
        BigInt(now),
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
    console.log(
      interestPayment,
      interestCollectorPayment,
      interestTreasuryPayment,
    );
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
