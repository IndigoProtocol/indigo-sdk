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
import {
  addrDetails,
  calculateFeeFromPercentage,
  getRandomElement,
  scriptRef,
} from '../helpers';
import { IAssetHelpers } from '../helpers/asset-helpers';
import { AssetClass, CDP, CDPDatum, CDPFees } from '../types';
import { PriceOracleContract } from './price-oracle';
import { CDPCreatorContract } from './cdp-creator';
import { _cdpValidator } from '../scripts';
import { CollectorContract } from './collector';
import { InterestOracleContract } from './interest-oracle';
import { GovContract } from './gov';
import { TreasuryContract } from './treasury';

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
  ): Promise<TxBuilder> {
    const [pkh, skh] = await addrDetails(lucid);
    const now = Date.now();
    const assetOut = await (assetRef
      ? IAssetHelpers.findIAssetByRef(assetRef, params, lucid)
      : IAssetHelpers.findIAssetByName(asset, params, lucid));

    // Fail if delisted asset
    if ('getOnChainPrice' in assetOut.datum.price)
      return Promise.reject('Trying to open CDP against delisted asset');

    const oracleAsset = assetOut.datum.price as AssetClass;
    const oracleOut = priceOracleRef
      ? (await lucid.utxosByOutRef([priceOracleRef]))[0]
      : await lucid.utxoByUnit(
          oracleAsset[0].unCurrencySymbol +
            fromText(oracleAsset[1].unTokenName),
        );
    if (!oracleOut.datum) return Promise.reject('Price Oracle datum not found');
    const oracleDatum = PriceOracleContract.decodePriceOracleDatum(
      oracleOut.datum,
    );

    const interestOracleAsset = assetOut.datum.interestOracle;
    const interestOracleOut = interestOracleRef
      ? (await lucid.utxosByOutRef([interestOracleRef]))[0]
      : await lucid.utxoByUnit(
          interestOracleAsset[0].unCurrencySymbol +
            fromText(interestOracleAsset[1].unTokenName),
        );
    if (!interestOracleOut.datum)
      return Promise.reject('Interest Oracle datum not found');
    const interestOracleDatum =
      InterestOracleContract.decodeInterestOracleDatum(interestOracleOut.datum);

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
    const newSnapshot = InterestOracleContract.calculateUnitaryInterestSinceOracleLastUpdated(
      BigInt(now),
      interestOracleDatum,
    ) + interestOracleDatum.unitaryInterest;
    const cdpDatum = CDPContract.datum(pkh, asset, mintedAmount, {
      type: 'ActiveCDPInterestTracking',
      last_settled: BigInt(now),
      unitary_interest_snapshot: newSnapshot
    });
    
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
      mintedAmount * oracleDatum.price,
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
        { kind: 'inline', value: Data.to(cdpDatum) },
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
      .validFrom(Number(now - 60_000))
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
    const cdpDatum = CDPContract.decodeCdpDatum(cdp.datum);
    if (cdpDatum.type !== 'CDP') throw 'Invalid CDP Datum';
    const iAsset = await (assetRef
      ? IAssetHelpers.findIAssetByRef(assetRef, params, lucid)
      : IAssetHelpers.findIAssetByName(cdpDatum.asset, params, lucid));

    const gov = govRef
      ? (await lucid.utxosByOutRef([govRef]))[0]
      : await lucid.utxoByUnit(
          params.govParams.govNFT[0].unCurrencySymbol +
            fromText(params.govParams.govNFT[1].unTokenName),
        );
    // const [iAsset, cdp, gov] = await lucid.utxosByOutRef([
    //   dIAssetTokenRef,
    //   dCDPTokenRef,
    //   dGovTokenRef,
    // ]);
    if (!gov.datum) throw 'Unable to find Gov Datum';
    const govData = GovContract.decodeGovDatum(gov.datum);
    if (!govData) throw 'No Governance datum found';
    const cdpScriptRefUtxo = await CDPContract.scriptRef(
      params.scriptReferences,
      lucid,
    );
    const cdpAssets = Object.assign({}, cdp.assets);
    cdpAssets['lovelace'] = cdp.assets['lovelace'] + collateralAmount;

    const interestOracleAsset = iAsset.datum.interestOracle;
    const interestOracleOut = interestOracleRef
      ? (await lucid.utxosByOutRef([interestOracleRef]))[0]
      : await lucid.utxoByUnit(
          interestOracleAsset[0].unCurrencySymbol +
            fromText(interestOracleAsset[1].unTokenName),
        );
    if (!interestOracleOut.datum)
      return Promise.reject('Interest Oracle datum not found');
    const interestOracleDatum =
      InterestOracleContract.decodeInterestOracleDatum(interestOracleOut.datum);

    let tx = lucid
      .newTx()
      .collectFrom([cdp], Data.to(new Constr(0, [BigInt(now), mintAmount, collateralAmount])))
      .readFrom([iAsset.utxo, gov, cdpScriptRefUtxo])
      .addSignerKey(pkh.hash);
    if (!cdp.datum) throw 'Unable to find CDP Datum';
    let cdpD = CDPContract.decodeCdpDatum(cdp.datum);
    if (!cdpD || cdpD.type !== 'CDP') throw 'Invalid CDP Datum';

    if (cdpD.fees.type !== 'ActiveCDPInterestTracking')
      throw 'Invalid CDP Fees';
    
    const newSnapshot = InterestOracleContract.calculateUnitaryInterestSinceOracleLastUpdated(
      BigInt(now),
      interestOracleDatum,
    ) + interestOracleDatum.unitaryInterest;
    
    const cdpD_: CDP = { 
      ...cdpD, 
      mintedAmount: cdpD.mintedAmount + mintAmount, 
      fees: { 
        type: 'ActiveCDPInterestTracking', 
        last_settled: BigInt(now), 
        unitary_interest_snapshot: newSnapshot
      } 
    };

    tx.pay.ToContract(
      cdp.address,
      {
        kind: 'inline',
        value: CDPContract.encodeCdpDatum(cdpD_),
      },
      cdpAssets,
    );

    // Find Oracle Ref Input
    const oracleAsset = iAsset.datum.price as AssetClass;
    const oracleRefInput = priceOracleRef
      ? (await lucid.utxosByOutRef([priceOracleRef]))[0]
      : await lucid.utxoByUnit(
          oracleAsset[0].unCurrencySymbol +
            fromText(oracleAsset[1].unTokenName),
        );

    // Fail if delisted asset
    if (!oracleRefInput.datum) return Promise.reject('Invalid oracle input');
    const od = PriceOracleContract.decodePriceOracleDatum(oracleRefInput.datum);
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
    tx
      .readFrom([oracleRefInput])
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
        mintAmount * od.price,
      );
    }

    // Interest payment
    
    const interestPaymentAsset = InterestOracleContract.calculateAccruedInterest(
      BigInt(now),
      cdpD.fees.unitary_interest_snapshot,
      cdpD.mintedAmount,
      cdpD.fees.last_settled,
      interestOracleDatum,
    );
    const interestPayment = (interestPaymentAsset * od.price) / 1_000_000n;
    const interestCollectorPayment = calculateFeeFromPercentage(
      iAsset.datum.interestCollectorPortionPercentage.getOnChainInt,
      interestPayment,
    );
    const interestTreasuryPayment = interestPayment - interestCollectorPayment;
    console.log(interestPayment, interestCollectorPayment, interestTreasuryPayment);
    if (interestTreasuryPayment > 0) {
      await TreasuryContract.feeTx(interestTreasuryPayment, lucid, params, tx, treasuryRef);
    }

    fee += interestCollectorPayment;
    tx.readFrom([interestOracleOut]);

    if (mintAmount !== 0n) {
      const iAssetTokenScriptRefUtxo = await CDPContract.assetTokenRef(
        params.scriptReferences,
        lucid,
      );
      const iassetToken =
        params.cdpParams.cdpAssetSymbol.unCurrencySymbol + fromText(cdpD.asset);
      const mintValue = {} as Assets;
      mintValue[iassetToken] = mintAmount;

      tx.readFrom([iAssetTokenScriptRefUtxo]).mintAssets(
        mintValue,
        Data.to(new Constr(0, [])),
      );
    }

    if (fee > 0n) {
      await CollectorContract.feeTx(fee, lucid, params, tx, collectorRef)
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
    const cdpDatum = CDPContract.decodeCdpDatum(cdp.datum);
    if (cdpDatum.type !== 'CDP') throw 'Invalid CDP Datum';
    const iAsset = await (assetRef
      ? IAssetHelpers.findIAssetByRef(assetRef, params, lucid)
      : IAssetHelpers.findIAssetByName(cdpDatum.asset, params, lucid));

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

    const interestOracleAsset = iAsset.datum.interestOracle;
    const interestOracleOut = interestOracleRef
      ? (await lucid.utxosByOutRef([interestOracleRef]))[0]
      : await lucid.utxoByUnit(
          interestOracleAsset[0].unCurrencySymbol +
            fromText(interestOracleAsset[1].unTokenName),
        );
    if (!interestOracleOut.datum)
      return Promise.reject('Interest Oracle datum not found');
    const interestOracleDatum =
      InterestOracleContract.decodeInterestOracleDatum(interestOracleOut.datum);

    let tx = lucid
      .newTx()
      .collectFrom([cdp], Data.to(new Constr(1, [BigInt(now)])))
      .readFrom([iAsset.utxo, gov, cdpScriptRefUtxo])
      .addSignerKey(pkh.hash);
    if (!cdp.datum) throw 'Unable to find CDP Datum';
    let cdpD = CDPContract.decodeCdpDatum(cdp.datum);
    if (!cdpD || cdpD.type !== 'CDP') throw 'Invalid CDP Datum';

    if (cdpD.fees.type !== 'ActiveCDPInterestTracking')
      throw 'Invalid CDP Fees';

    // Find Oracle Ref Input
    const oracleAsset = iAsset.datum.price as AssetClass;
    const oracleRefInput = priceOracleRef
      ? (await lucid.utxosByOutRef([priceOracleRef]))[0]
      : await lucid.utxoByUnit(
          oracleAsset[0].unCurrencySymbol +
            fromText(oracleAsset[1].unTokenName),
        );

    // Fail if delisted asset
    if (!oracleRefInput.datum) return Promise.reject('Invalid oracle input');
    const od = PriceOracleContract.decodePriceOracleDatum(oracleRefInput.datum);
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
    tx
      .readFrom([oracleRefInput])
      .validFrom(Number(timeValidFrom))
      .validTo(Number(timeValidTo));

    let fee = 0n;

    // Interest payment
    const interestPaymentAsset = InterestOracleContract.calculateAccruedInterest(
      BigInt(now),
      cdpD.fees.unitary_interest_snapshot,
      cdpD.mintedAmount,
      cdpD.fees.last_settled,
      interestOracleDatum,
    );
    const interestPayment = (interestPaymentAsset * od.price) / 1_000_000n;
    const interestCollectorPayment = calculateFeeFromPercentage(
      iAsset.datum.interestCollectorPortionPercentage.getOnChainInt,
      interestPayment,
    );
    const interestTreasuryPayment = interestPayment - interestCollectorPayment;
    console.log(interestPayment, interestCollectorPayment, interestTreasuryPayment);
    if (interestTreasuryPayment > 0) {
      await TreasuryContract.feeTx(interestTreasuryPayment, lucid, params, tx, treasuryRef);
    }

    fee += interestCollectorPayment;
    tx.readFrom([interestOracleOut]);

    const iAssetTokenScriptRefUtxo = await CDPContract.assetTokenRef(
      params.scriptReferences,
      lucid,
    );
    const iassetToken =
      params.cdpParams.cdpAssetSymbol.unCurrencySymbol + fromText(cdpD.asset);
    const assetBurnValue = {} as Assets;
    assetBurnValue[iassetToken] = -cdpD.mintedAmount;
    const cdpTokenBurnValue = {} as Assets;
    cdpTokenBurnValue[params.cdpParams.cdpAuthToken[0].unCurrencySymbol + fromText(params.cdpParams.cdpAuthToken[1].unTokenName)] = -1n;
    const cdpAuthTokenScriptRefUtxo = await CDPContract.cdpAuthTokenRef(
      params.scriptReferences,
      lucid,
    );
    tx.readFrom([iAssetTokenScriptRefUtxo]).mintAssets(
      assetBurnValue,
      Data.to(new Constr(0, [])),
    ).readFrom([cdpAuthTokenScriptRefUtxo]).mintAssets(
      cdpTokenBurnValue,
      Data.to(new Constr(0, [])),
    );

    if (fee > 0n) {
      await CollectorContract.feeTx(fee, lucid, params, tx, collectorRef)
    }

    return tx;
  }

  static decodeCdpDatum(datum: string): CDPDatum {
    const cdpDatum = Data.from(datum) as any;
    if (cdpDatum.index == 1 && cdpDatum.fields[0].index == 0) {
      const iasset = cdpDatum.fields[0].fields;
      return {
        type: 'IAsset',
        name: toText(iasset[0]),
        price:
          iasset[1].index === 0
            ? { getOnChainInt: iasset[1].fields[0] }
            : [
                { unCurrencySymbol: iasset[1].fields[0].fields[0].fields[0] },
                {
                  unTokenName: toText(iasset[1].fields[0].fields[0].fields[1]),
                },
              ],
        interestOracle: [
          { unCurrencySymbol: iasset[2].fields[0] },
          { unTokenName: toText(iasset[2].fields[1]) },
        ],
        redemptionRatioPercentage: { getOnChainInt: iasset[3].fields[0] },
        maintenanceRatioPercentage: { getOnChainInt: iasset[4].fields[0] },
        liquidationRatioPercentage: { getOnChainInt: iasset[5].fields[0] },
        debtMintingFeePercentage: { getOnChainInt: iasset[6].fields[0] },
        liquidationProcessingFeePercentage: {
          getOnChainInt: iasset[7].fields[0],
        },
        stabilityPoolWithdrawalFeePercentage: {
          getOnChainInt: iasset[8].fields[0],
        },
        redemptionReimbursementPercentage: {
          getOnChainInt: iasset[9].fields[0],
        },
        redemptionProcessingFeePercentage: {
          getOnChainInt: iasset[10].fields[0],
        },
        interestCollectorPortionPercentage: {
          getOnChainInt: iasset[11].fields[0],
        },
        firstAsset: iasset[12].index === 1,
        nextAsset:
          iasset[13].index === 0 ? toText(iasset[13].fields[0]) : undefined,
      };
    } else if (cdpDatum.index == 0 && cdpDatum.fields[0].index == 0) {
      const cdp = cdpDatum.fields[0].fields;
      return {
        type: 'CDP',
        owner: cdp[0].fields[0],
        asset: toText(cdp[1]),
        mintedAmount: cdp[2],
        fees:
          cdp[3].index === 0
            ? {
                type: 'ActiveCDPInterestTracking',
                last_settled: cdp[3].fields[0],
                unitary_interest_snapshot: cdp[3].fields[1],
              }
            : {
                type: 'FrozenCDPAccumulatedFees',
                lovelaces_treasury: cdp[3].fields[0],
                lovelaces_indy_stakers: cdp[3].fields[1],
              },
      };
    }

    throw 'Invalid CDP Datum provided';
  }

  static encodeCdpDatum(datum: CDPDatum): string {
    if (datum.type === 'CDP') {
      return Data.to(
        new Constr(0, [
          new Constr(0, [
            datum.owner ? new Constr(0, [datum.owner]) : new Constr(1, []),
            fromText(datum.asset),
            BigInt(datum.mintedAmount),
            datum.fees.type === 'ActiveCDPInterestTracking'
              ? new Constr(0, [
                  datum.fees.last_settled,
                  datum.fees.unitary_interest_snapshot,
                ])
              : new Constr(1, [
                  datum.fees.lovelaces_treasury,
                  datum.fees.lovelaces_indy_stakers,
                ]),
          ]),
        ]),
      );
    } else if (datum.type === 'IAsset') {
      return Data.to(
        new Constr(1, [
          new Constr(0, [
            fromText(datum.name),
            'getOnChainInt' in datum.price
              ? new Constr(0, [
                  new Constr(0, [BigInt(datum.price.getOnChainInt)]),
                ])
              : new Constr(1, [
                  new Constr(0, [
                    new Constr(0, [
                      datum.price[0].unCurrencySymbol,
                      fromText(datum.price[1].unTokenName),
                    ]),
                  ]),
                ]),
            new Constr(0, [
              datum.interestOracle[0].unCurrencySymbol,
              fromText(datum.interestOracle[1].unTokenName),
            ]),
            new Constr(0, [
              BigInt(datum.redemptionRatioPercentage.getOnChainInt),
            ]),
            new Constr(0, [
              BigInt(datum.maintenanceRatioPercentage.getOnChainInt),
            ]),
            new Constr(0, [
              BigInt(datum.liquidationRatioPercentage.getOnChainInt),
            ]),
            new Constr(0, [
              BigInt(datum.debtMintingFeePercentage.getOnChainInt),
            ]),
            new Constr(0, [
              BigInt(datum.liquidationProcessingFeePercentage.getOnChainInt),
            ]),
            new Constr(0, [
              BigInt(datum.stabilityPoolWithdrawalFeePercentage.getOnChainInt),
            ]),
            new Constr(0, [
              BigInt(datum.redemptionReimbursementPercentage.getOnChainInt),
            ]),
            new Constr(0, [
              BigInt(datum.redemptionProcessingFeePercentage.getOnChainInt),
            ]),
            new Constr(0, [
              BigInt(datum.interestCollectorPortionPercentage.getOnChainInt),
            ]),
            datum.firstAsset ? new Constr(1, []) : new Constr(0, []),
            datum.nextAsset
              ? new Constr(0, [fromText(datum.nextAsset)])
              : new Constr(1, []),
          ]),
        ]),
      );
    }

    throw 'Invalid CDP Datum provided';
  }

  static datum(
    hash: Credential,
    asset: string,
    mintedAmount: bigint,
    fees: CDPFees,
  ): Constr<Data> {
    return new Constr(0, [
      new Constr(0, [
        new Constr(0, [hash.hash]),
        fromText(asset),
        BigInt(mintedAmount),
        fees.type === 'ActiveCDPInterestTracking'
          ? new Constr(0, [
              BigInt(fees.last_settled),
              BigInt(fees.unitary_interest_snapshot),
            ])
          : new Constr(0, [
              BigInt(fees.lovelaces_treasury),
              BigInt(fees.lovelaces_indy_stakers),
            ]),
      ]),
    ]);
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
