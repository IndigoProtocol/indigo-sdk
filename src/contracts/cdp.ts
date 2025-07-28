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
import { IAssetHelpers } from '../helpers/asset-helpers';
import { CDPCreatorContract } from './cdp-creator';
import { CollectorContract } from './collector';
import { InterestOracleContract } from './interest-oracle';
import { GovContract } from './gov';
import { TreasuryContract } from './treasury';
import {
  addrDetails,
  getRandomElement,
  scriptRef,
} from '../helpers/lucid-utils';
import { AssetClass } from '../types/generic';
import { calculateFeeFromPercentage } from '../helpers/helpers';
import { CDP } from '../types/indigo/cdp';
import { _cdpValidator } from '../scripts/cdp-validator';
import { PriceOracle } from '../types/indigo/price-oracle';
import { InterestOracle } from '../types/indigo/interest-oracle';

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
    if (!('Reference' in assetOut.datum.price))
      return Promise.reject('Trying to open CDP against delisted asset');

    const oracleAsset =
      assetOut.datum.price.Reference.OracleAssetNft.AssetClass;
    const oracleOut = priceOracleRef
      ? (await lucid.utxosByOutRef([priceOracleRef]))[0]
      : await lucid.utxoByUnit(oracleAsset.policy_id + oracleAsset.asset_name);
    if (!oracleOut.datum) return Promise.reject('Price Oracle datum not found');
    const oracleDatum = Data.from(oracleOut.datum, PriceOracle);

    const interestOracleAsset = assetOut.datum.interestOracle;
    const interestOracleOut = interestOracleRef
      ? (await lucid.utxosByOutRef([interestOracleRef]))[0]
      : await lucid.utxoByUnit(
          interestOracleAsset.policy_id + interestOracleAsset.asset_name,
        );
    if (!interestOracleOut.datum)
      return Promise.reject('Interest Oracle datum not found');
    const interestOracleDatum = Data.from(
      interestOracleOut.datum,
      InterestOracle,
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
    const cdpDatum: CDP = {
      CDP: {
        data: {
          owner: pkh.hash,
          asset: fromText(asset),
          mintedAmount: mintedAmount,
          fees: {
            ActiveCDPInterestTracking: {
              last_settled: BigInt(now),
              unitary_interest_snapshot: newSnapshot,
            },
          },
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
      BigInt(assetOut.datum.debtMintingFeePercentage.value),
      (mintedAmount * oracleDatum.price.value) / 1_000_000n,
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
        { kind: 'inline', value: Data.to(cdpDatum, CDP) },
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
    const cdpDatum = Data.from(cdp.datum, CDP);
    if (!('CDP' in cdpDatum)) throw 'Invalid CDP Datum';
    const iAsset = await (assetRef
      ? IAssetHelpers.findIAssetByRef(assetRef, params, lucid)
      : IAssetHelpers.findIAssetByName(cdpDatum.CDP.data.asset, params, lucid));

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
          interestOracleAsset.policy_id + interestOracleAsset.asset_name,
        );
    if (!interestOracleOut.datum)
      return Promise.reject('Interest Oracle datum not found');
    const interestOracleDatum = Data.from(
      interestOracleOut.datum,
      InterestOracle,
    );

    let tx = lucid
      .newTx()
      .collectFrom(
        [cdp],
        Data.to(new Constr(0, [BigInt(now), mintAmount, collateralAmount])),
      )
      .readFrom([iAsset.utxo, gov, cdpScriptRefUtxo])
      .addSignerKey(pkh.hash);
    if (!cdp.datum) throw 'Unable to find CDP Datum';
    let cdpD = Data.from(cdp.datum, CDP);
    if (!cdpD || !('CDP' in cdpD)) throw 'Invalid CDP Datum';

    if (!('ActiveCDPInterestTracking' in cdpD.CDP.data.fees))
      throw 'Invalid CDP Fees';

    const newSnapshot =
      InterestOracleContract.calculateUnitaryInterestSinceOracleLastUpdated(
        BigInt(now),
        interestOracleDatum,
      ) + interestOracleDatum.unitaryInterest;

    const cdpD_: CDP = {
      CDP: {
        data: {
          ...cdpD.CDP.data,
          mintedAmount: cdpD.CDP.data.mintedAmount + mintAmount,
          fees: {
            ActiveCDPInterestTracking: {
              last_settled: BigInt(now),
              unitary_interest_snapshot: newSnapshot,
            },
          },
        },
      },
    };

    tx.pay.ToContract(
      cdp.address,
      {
        kind: 'inline',
        value: Data.to(cdpD_, CDP),
      },
      cdpAssets,
    );

    // Find Oracle Ref Input
    if (!('Reference' in iAsset.datum.price)) throw 'Invalid iAsset price';
    const oracleAsset = iAsset.datum.price.Reference.OracleAssetNft.AssetClass;
    const oracleRefInput = priceOracleRef
      ? (await lucid.utxosByOutRef([priceOracleRef]))[0]
      : await lucid.utxoByUnit(oracleAsset.policy_id + oracleAsset.asset_name);

    // Fail if delisted asset
    if (!oracleRefInput.datum) return Promise.reject('Invalid oracle input');
    const od = Data.from(oracleRefInput.datum, PriceOracle);
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
        iAsset.datum.debtMintingFeePercentage.value,
        (mintAmount * od.price.value) / 1_000_000n,
      );
    }

    // Interest payment

    const interestPaymentAsset =
      InterestOracleContract.calculateAccruedInterest(
        BigInt(now),
        cdpD.CDP.data.fees.ActiveCDPInterestTracking.unitary_interest_snapshot,
        cdpD.CDP.data.mintedAmount,
        cdpD.CDP.data.fees.ActiveCDPInterestTracking.last_settled,
        interestOracleDatum,
      );
    const interestPayment =
      (interestPaymentAsset * od.price.value) / 1_000_000n;
    const interestCollectorPayment = calculateFeeFromPercentage(
      iAsset.datum.interestCollectorPortionPercentage.value,
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
        params.cdpParams.cdpAssetSymbol.unCurrencySymbol + cdpD.CDP.data.asset;
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
    const cdpDatum = Data.from(cdp.datum, CDP);
    if (!('CDP' in cdpDatum)) throw 'Invalid CDP Datum';
    const iAsset = await (assetRef
      ? IAssetHelpers.findIAssetByRef(assetRef, params, lucid)
      : IAssetHelpers.findIAssetByName(cdpDatum.CDP.data.asset, params, lucid));

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
          interestOracleAsset.policy_id + interestOracleAsset.asset_name,
        );
    if (!interestOracleOut.datum)
      return Promise.reject('Interest Oracle datum not found');
    const interestOracleDatum = Data.from(
      interestOracleOut.datum,
      InterestOracle,
    );

    let tx = lucid
      .newTx()
      .collectFrom([cdp], Data.to(new Constr(1, [BigInt(now)])))
      .readFrom([iAsset.utxo, gov, cdpScriptRefUtxo])
      .addSignerKey(pkh.hash);
    if (!cdp.datum) throw 'Unable to find CDP Datum';
    let cdpD = Data.from(cdp.datum, CDP);
    if (!cdpD || !('CDP' in cdpD)) throw 'Invalid CDP Datum';

    if ('FrozenCDPAccumulatedFees' in cdpD.CDP.data.fees)
      throw 'Invalid CDP Fees';

    // Find Oracle Ref Input
    if ('Delisted' in iAsset.datum.price) throw 'Invalid iAsset price';
    const oracleAsset = iAsset.datum.price.Reference.OracleAssetNft.AssetClass;
    const oracleRefInput = priceOracleRef
      ? (await lucid.utxosByOutRef([priceOracleRef]))[0]
      : await lucid.utxoByUnit(oracleAsset.policy_id + oracleAsset.asset_name);

    // Fail if delisted asset
    if (!oracleRefInput.datum) return Promise.reject('Invalid oracle input');
    const od = Data.from(oracleRefInput.datum, PriceOracle);
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

    // Interest payment
    const interestPaymentAsset =
      InterestOracleContract.calculateAccruedInterest(
        BigInt(now),
        cdpD.CDP.data.fees.ActiveCDPInterestTracking.unitary_interest_snapshot,
        cdpD.CDP.data.mintedAmount,
        cdpD.CDP.data.fees.ActiveCDPInterestTracking.last_settled,
        interestOracleDatum,
      );
    const interestPayment =
      (interestPaymentAsset * od.price.value) / 1_000_000n;
    const interestCollectorPayment = calculateFeeFromPercentage(
      iAsset.datum.interestCollectorPortionPercentage.value,
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
      params.cdpParams.cdpAssetSymbol.unCurrencySymbol + cdpD.CDP.data.asset;
    const assetBurnValue = {} as Assets;
    assetBurnValue[iassetToken] = -cdpD.CDP.data.mintedAmount;
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
