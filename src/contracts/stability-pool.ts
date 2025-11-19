import {
  Constr,
  fromText,
  LucidEvolution,
  TxBuilder,
  validatorToScriptHash,
  Data,
  UTxO,
  credentialToAddress,
} from '@lucid-evolution/lucid';
import {
  EpochToScaleToSum,
  mkSPInteger,
  parseAccountDatum,
  parseStabilityPoolDatum,
  serialiseStabilityPoolDatum,
  serialiseStabilityPoolRedeemer,
  spDiv,
  spMul,
  StabilityPoolDatum,
  StabilityPoolRedeemer,
  StabilityPoolSnapshot,
  AccountAction,
  AccountContent,
  spAdd,
  fromSPInteger,
  ActionReturnDatum,
  spSub,
} from '../types/indigo/stability-pool';
import { SystemParams } from '../types/system-params';
import { addrDetails, scriptRef } from '../helpers/lucid-utils';
import { mkStabilityPoolValidatorFromSP } from '../scripts/stability-pool-validator';
import {
  adjustmentHelper,
  setSumInEpochToScaleToSum,
  updatePoolSnapshotWithdrawalFee,
} from '../helpers/stability-pool-helpers';
import { calculateFeeFromPercentage } from '../helpers/indigo-helpers';
import { GovDatum, parseGovDatum } from '../types/indigo/gov';
import { IAssetContent, parseIAssetDatum } from '../types/indigo/cdp';
import { CollectorContract } from './collector';
import { addressFromBech32, addressToBech32 } from '../types/generic';

export class StabilityPoolContract {
  static async createAccount(
    asset: string,
    amount: bigint,
    params: SystemParams,
    lucid: LucidEvolution,
  ): Promise<TxBuilder> {
    const [pkh, _skh] = await addrDetails(lucid);
    const minLovelaces = BigInt(
      params.stabilityPoolParams.accountCreateFeeLovelaces +
        params.stabilityPoolParams.requestCollateralLovelaces,
    );
    const datum: StabilityPoolDatum = {
      Account: {
        content: {
          owner: pkh.hash,
          asset: fromText(asset),
          snapshot: {
            productVal: { value: 0n },
            depositVal: { value: 0n },
            sumVal: { value: 0n },
            epoch: 0n,
            scale: 0n,
          },
          request: 'Create',
        },
      },
    };

    return lucid
      .newTx()
      .pay.ToContract(
        credentialToAddress(lucid.config().network, {
          hash: validatorToScriptHash(
            mkStabilityPoolValidatorFromSP(params.stabilityPoolParams),
          ),
          type: 'Script',
        }),
        { kind: 'inline', value: serialiseStabilityPoolDatum(datum) },
        {
          lovelace: minLovelaces,
          [params.stabilityPoolParams.assetSymbol.unCurrencySymbol +
          fromText(asset)]: amount,
        },
      )
      .addSignerKey(pkh.hash);
  }

  static async adjustAccount(
    asset: string,
    amount: bigint,
    accountUtxo: UTxO,
    params: SystemParams,
    lucid: LucidEvolution,
  ): Promise<TxBuilder> {
    const [pkh, _] = await addrDetails(lucid);
    const myAddress = await lucid.wallet().address();

    const stabilityPoolScriptRef = await scriptRef(
      params.scriptReferences.stabilityPoolValidatorRef,
      lucid,
    );

    const request: AccountAction = {
      Adjust: {
        amount: amount,
        outputAddress: addressFromBech32(myAddress),
      },
    };
    const oldAccountDatum: AccountContent = parseAccountDatum(
      accountUtxo.datum,
    );

    const newAccountDatum: AccountContent = {
      ...oldAccountDatum,
      request,
    };

    const redeemer: StabilityPoolRedeemer = {
      RequestAction: {
        action: request,
      },
    };

    const value = {
      lovelace: BigInt(
        params.stabilityPoolParams.requestCollateralLovelaces +
          params.stabilityPoolParams.accountAdjustmentFeeLovelaces,
      ),
      [params.stabilityPoolParams.accountToken[0].unCurrencySymbol +
      fromText(params.stabilityPoolParams.accountToken[1].unTokenName)]: 1n,
    };

    if (amount > 0n) {
      value[
        params.stabilityPoolParams.assetSymbol.unCurrencySymbol +
          fromText(asset)
      ] = amount;
    }

    return lucid
      .newTx()
      .readFrom([stabilityPoolScriptRef])
      .collectFrom([accountUtxo], serialiseStabilityPoolRedeemer(redeemer))
      .pay.ToContract(
        credentialToAddress(lucid.config().network, {
          hash: validatorToScriptHash(
            mkStabilityPoolValidatorFromSP(params.stabilityPoolParams),
          ),
          type: 'Script',
        }),
        {
          kind: 'inline',
          value: serialiseStabilityPoolDatum({
            Account: {
              content: newAccountDatum,
            },
          }),
        },
        value,
      )
      .addSignerKey(pkh.hash);
  }

  static async closeAccount(
    accountUtxo: UTxO,
    params: SystemParams,
    lucid: LucidEvolution,
  ): Promise<TxBuilder> {
    const [pkh, _] = await addrDetails(lucid);
    const myAddress = await lucid.wallet().address();

    const stabilityPoolScriptRef = await scriptRef(
      params.scriptReferences.stabilityPoolValidatorRef,
      lucid,
    );

    const request: AccountAction = {
      Close: {
        outputAddress: addressFromBech32(myAddress),
      },
    };
    const oldAccountDatum: AccountContent = parseAccountDatum(
      accountUtxo.datum,
    );
    const newAccountDatum: AccountContent = {
      ...oldAccountDatum,
      request,
    };

    const redeemer: StabilityPoolRedeemer = {
      RequestAction: {
        action: request,
      },
    };

    return lucid
      .newTx()
      .readFrom([stabilityPoolScriptRef])
      .collectFrom([accountUtxo], serialiseStabilityPoolRedeemer(redeemer))
      .pay.ToContract(
        credentialToAddress(lucid.config().network, {
          hash: validatorToScriptHash(
            mkStabilityPoolValidatorFromSP(params.stabilityPoolParams),
          ),
          type: 'Script',
        }),
        {
          kind: 'inline',
          value: serialiseStabilityPoolDatum({
            Account: {
              content: newAccountDatum,
            },
          }),
        },
        {
          lovelace: BigInt(
            params.stabilityPoolParams.requestCollateralLovelaces +
              params.stabilityPoolParams.accountAdjustmentFeeLovelaces,
          ),
          [params.stabilityPoolParams.accountToken[0].unCurrencySymbol +
          fromText(params.stabilityPoolParams.accountToken[1].unTokenName)]: 1n,
        },
      )
      .addSignerKey(pkh.hash);
  }

  static async processRequest(
    asset: string,
    stabilityPoolUtxo: UTxO,
    accountUtxo: UTxO,
    govUtxo: UTxO,
    iAssetUtxo: UTxO,
    newSnapshotUtxo: UTxO | undefined,
    params: SystemParams,
    lucid: LucidEvolution,
  ): Promise<TxBuilder> {
    const redeemer: StabilityPoolRedeemer = {
      ProcessRequest: {
        requestRef: {
          txHash: { hash: accountUtxo.txHash },
          outputIndex: BigInt(accountUtxo.outputIndex),
        },
      },
    };
    const stabilityPoolScriptRef = await scriptRef(
      params.scriptReferences.stabilityPoolValidatorRef,
      lucid,
    );

    const accountDatum = parseAccountDatum(accountUtxo.datum);
    const stabilityPoolDatum = parseStabilityPoolDatum(stabilityPoolUtxo.datum);

    const tx = lucid
      .newTx()
      .collectFrom(
        [stabilityPoolUtxo],
        serialiseStabilityPoolRedeemer(redeemer),
      )
      .collectFrom([accountUtxo], serialiseStabilityPoolRedeemer(redeemer))
      .readFrom([iAssetUtxo, govUtxo, stabilityPoolScriptRef]);

    if (!accountDatum.request) throw new Error('Account Request is null');
    if (accountDatum.request === 'Create') {
      const accountTokenScriptRef = await scriptRef(
        params.scriptReferences.authTokenPolicies.accountTokenRef,
        lucid,
      );
      tx.readFrom([accountTokenScriptRef]);

      const iassetUnit =
        params.stabilityPoolParams.assetSymbol.unCurrencySymbol +
        fromText(asset);
      const reqAmount = accountUtxo.assets[iassetUnit] ?? 0n;

      const newAccountSnapshot: StabilityPoolSnapshot = {
        ...stabilityPoolDatum.snapshot,
        depositVal: {
          value: spAdd(accountDatum.snapshot.depositVal, mkSPInteger(reqAmount))
            .value,
        },
      };

      const newDeposit = spAdd(
        stabilityPoolDatum.snapshot.depositVal,
        mkSPInteger(reqAmount),
      );
      const newSum = spAdd(
        stabilityPoolDatum.snapshot.sumVal,
        spDiv(
          spMul(
            mkSPInteger(
              BigInt(params.stabilityPoolParams.accountCreateFeeLovelaces),
            ),
            stabilityPoolDatum.snapshot.productVal,
          ),
          newDeposit,
        ),
      );
      const newStabilityPoolSnapshot: StabilityPoolSnapshot = {
        ...stabilityPoolDatum.snapshot,
        depositVal: newDeposit,
        sumVal: newSum,
      };

      const newEpochToScaleToSum: EpochToScaleToSum = new Map(
        stabilityPoolDatum.epochToScaleToSum,
      );
      newEpochToScaleToSum.set(
        {
          epoch: stabilityPoolDatum.snapshot.epoch,
          scale: stabilityPoolDatum.snapshot.scale,
        },
        newSum,
      );

      const stabilityPoolAssetToken =
        stabilityPoolUtxo.assets[iassetUnit] ?? 0n;
      const poolOutputValue = {
        lovelace:
          stabilityPoolUtxo.assets.lovelace +
          BigInt(params.stabilityPoolParams.accountCreateFeeLovelaces),
        [params.stabilityPoolParams.stabilityPoolToken[0].unCurrencySymbol +
        fromText(params.stabilityPoolParams.stabilityPoolToken[1].unTokenName)]:
          1n,
        [params.stabilityPoolParams.assetSymbol.unCurrencySymbol +
        fromText(asset)]: stabilityPoolAssetToken + reqAmount,
      };

      tx.mintAssets(
        {
          [params.stabilityPoolParams.accountToken[0].unCurrencySymbol +
          fromText(params.stabilityPoolParams.accountToken[1].unTokenName)]: 1n,
        },
        Data.to(new Constr(0, [])),
      );

      tx.pay.ToContract(
        stabilityPoolUtxo.address,
        {
          kind: 'inline',
          value: serialiseStabilityPoolDatum({
            StabilityPool: {
              content: {
                ...stabilityPoolDatum,
                snapshot: newStabilityPoolSnapshot,
                epochToScaleToSum: newEpochToScaleToSum,
              },
            },
          }),
        },
        poolOutputValue,
      );

      tx.pay.ToContract(
        stabilityPoolUtxo.address,
        {
          kind: 'inline',
          value: serialiseStabilityPoolDatum({
            Account: {
              content: {
                ...accountDatum,
                snapshot: newAccountSnapshot,
                request: null,
              },
            },
          }),
        },
        {
          lovelace:
            accountUtxo.assets.lovelace -
            BigInt(params.stabilityPoolParams.accountCreateFeeLovelaces),
          [params.stabilityPoolParams.accountToken[0].unCurrencySymbol +
          fromText(params.stabilityPoolParams.accountToken[1].unTokenName)]: 1n,
        },
      );
    } else if ('Adjust' in accountDatum.request) {
      const amount = accountDatum.request.Adjust.amount;
      const outputAddress = addressToBech32(
        lucid,
        accountDatum.request.Adjust.outputAddress,
      );
      const myAddress = await lucid.wallet().address();

      const [updatedAccountSnapshot, reward, refInputs] = adjustmentHelper(
        stabilityPoolUtxo,
        newSnapshotUtxo,
        stabilityPoolDatum.snapshot,
        stabilityPoolDatum.epochToScaleToSum,
        accountDatum.snapshot,
      );

      const govDatum: GovDatum = parseGovDatum(govUtxo.datum);
      const iassetDatum: IAssetContent = parseIAssetDatum(iAssetUtxo.datum);
      const rewardLovelacesFee = calculateFeeFromPercentage(
        govDatum.protocolParams.collateralFeePercentage,
        reward,
      );
      const isDepositOrRewardWithdrawal: boolean = amount > 0n;
      const bigIntMax = (...args: bigint[]): bigint =>
        args.reduce((m, e) => (e > m ? e : m));

      const balanceChange: bigint = isDepositOrRewardWithdrawal
        ? amount
        : bigIntMax(amount, -fromSPInteger(updatedAccountSnapshot.depositVal));
      const newAccountSnapshot: StabilityPoolSnapshot = {
        ...updatedAccountSnapshot,
        depositVal: spAdd(
          updatedAccountSnapshot.depositVal,
          mkSPInteger(balanceChange),
        ),
      };

      const _newPoolDepositExcludingFee = spAdd(
        stabilityPoolDatum.snapshot.depositVal,
        mkSPInteger(balanceChange),
      );
      const newPoolDepositExcludingFee =
        _newPoolDepositExcludingFee.value > 0n
          ? _newPoolDepositExcludingFee
          : mkSPInteger(0n);

      const withdrawalFee =
        isDepositOrRewardWithdrawal || newPoolDepositExcludingFee.value === 0n
          ? 0n
          : calculateFeeFromPercentage(
              iassetDatum.stabilityPoolWithdrawalFeePercentage,
              -balanceChange,
            );
      const newPoolDeposit = spAdd(
        newPoolDepositExcludingFee,
        mkSPInteger(withdrawalFee),
      );
      const newPoolProduct =
        withdrawalFee === 0n
          ? stabilityPoolDatum.snapshot.productVal
          : spMul(
              stabilityPoolDatum.snapshot.productVal,
              spAdd(
                mkSPInteger(1n),
                spDiv(mkSPInteger(withdrawalFee), newPoolDepositExcludingFee),
              ),
            );
      const newPoolSum = spAdd(
        stabilityPoolDatum.snapshot.sumVal,
        spDiv(
          spMul(
            mkSPInteger(
              BigInt(params.stabilityPoolParams.accountAdjustmentFeeLovelaces),
            ),
            newPoolProduct,
          ),
          newPoolDeposit,
        ),
      );
      const newPoolSnapshot: StabilityPoolSnapshot = {
        ...stabilityPoolDatum.snapshot,
        depositVal: newPoolDeposit,
        sumVal: newPoolSum,
        productVal: newPoolProduct,
      };
      const newEpochToScaleToSum: EpochToScaleToSum = setSumInEpochToScaleToSum(
        stabilityPoolDatum.epochToScaleToSum,
        stabilityPoolDatum.snapshot.epoch,
        stabilityPoolDatum.snapshot.scale,
        newPoolSum,
      );

      await CollectorContract.feeTx(rewardLovelacesFee, lucid, params, tx);

      tx.readFrom([govUtxo, iAssetUtxo, ...refInputs]);
      tx.pay.ToContract(
        stabilityPoolUtxo.address,
        {
          kind: 'inline',
          value: serialiseStabilityPoolDatum({
            StabilityPool: {
              content: {
                ...stabilityPoolDatum,
                snapshot: newPoolSnapshot,
                epochToScaleToSum: newEpochToScaleToSum,
              },
            },
          }),
        },
        {
          lovelace:
            stabilityPoolUtxo.assets.lovelace +
            BigInt(params.stabilityPoolParams.accountAdjustmentFeeLovelaces) -
            reward,
          [params.stabilityPoolParams.stabilityPoolToken[0].unCurrencySymbol +
          fromText(
            params.stabilityPoolParams.stabilityPoolToken[1].unTokenName,
          )]: 1n,
          [params.stabilityPoolParams.assetSymbol.unCurrencySymbol +
          fromText(asset)]:
            stabilityPoolUtxo.assets[
              params.stabilityPoolParams.assetSymbol.unCurrencySymbol +
                fromText(asset)
            ] +
            balanceChange +
            withdrawalFee,
        },
      );

      tx.pay.ToContract(
        stabilityPoolUtxo.address,
        {
          kind: 'inline',
          value: serialiseStabilityPoolDatum({
            Account: {
              content: {
                ...accountDatum,
                snapshot: newAccountSnapshot,
                request: null,
              },
            },
          }),
        },
        {
          lovelace:
            accountUtxo.assets.lovelace -
            BigInt(params.stabilityPoolParams.accountAdjustmentFeeLovelaces) -
            2_000_000n,
          [params.stabilityPoolParams.accountToken[0].unCurrencySymbol +
          fromText(params.stabilityPoolParams.accountToken[1].unTokenName)]: 1n,
        },
      );

      if (myAddress !== outputAddress) {
        tx.pay.ToAddressWithData(
          outputAddress,
          {
            kind: 'inline',
            value: Data.to(
              {
                IndigoStabilityPoolAccountAdjustment: {
                  spent_account: {
                    txHash: { hash: accountUtxo.txHash },
                    outputIndex: BigInt(accountUtxo.outputIndex),
                  },
                },
              },
              ActionReturnDatum,
            ),
          },
          {
            lovelace: reward - rewardLovelacesFee + 2_000_000n,
            ...(amount < 0n
              ? {
                  [params.stabilityPoolParams.assetSymbol.unCurrencySymbol +
                  fromText(asset)]: -(amount - withdrawalFee),
                }
              : {}),
          },
        );
      } else {
        // TODO: User is self-handling the process request, so we will need to handle the change datum
      }
    } else if ('Close' in accountDatum.request) {
      const outputAddress = addressToBech32(
        lucid,
        accountDatum.request.Close.outputAddress,
      );
      const myAddress = await lucid.wallet().address();

      const [updatedAccountSnapshot, reward, refInputs] = adjustmentHelper(
        stabilityPoolUtxo,
        newSnapshotUtxo,
        stabilityPoolDatum.snapshot,
        stabilityPoolDatum.epochToScaleToSum,
        accountDatum.snapshot,
      );

      const govDatum: GovDatum = parseGovDatum(govUtxo.datum);
      const iassetDatum: IAssetContent = parseIAssetDatum(iAssetUtxo.datum);
      const rewardLovelacesFee = calculateFeeFromPercentage(
        govDatum.protocolParams.collateralFeePercentage,
        reward,
      );

      const fund = updatedAccountSnapshot.depositVal;
      const newPoolDepositExcludingFee = spSub(
        stabilityPoolDatum.snapshot.depositVal,
        fund,
      );
      const withdrawnAmt = fund.value < 0n ? mkSPInteger(0n) : fund;
      const withdrawalFeeAmount =
        newPoolDepositExcludingFee.value === 0n
          ? 0n
          : calculateFeeFromPercentage(
              iassetDatum.stabilityPoolWithdrawalFeePercentage,
              withdrawnAmt.value,
            );

      const [newPoolDeposit, newPoolProduct] = updatePoolSnapshotWithdrawalFee(
        mkSPInteger(withdrawalFeeAmount),
        newPoolDepositExcludingFee,
        stabilityPoolDatum.snapshot,
      );
      const newPoolSnapshot: StabilityPoolSnapshot = {
        ...stabilityPoolDatum.snapshot,
        depositVal: newPoolDeposit,
        productVal: newPoolProduct,
      };

      const accountTokenRef = await scriptRef(
        params.scriptReferences.authTokenPolicies.accountTokenRef,
        lucid,
      );

      await CollectorContract.feeTx(rewardLovelacesFee, lucid, params, tx);

      tx.readFrom([govUtxo, iAssetUtxo, accountTokenRef, ...refInputs]);

      tx.mintAssets(
        {
          [params.stabilityPoolParams.accountToken[0].unCurrencySymbol +
          fromText(params.stabilityPoolParams.accountToken[1].unTokenName)]:
            -1n,
        },
        Data.to(new Constr(0, [])),
      );

      const assetOutputAmountForSP =
        stabilityPoolUtxo.assets[
          params.stabilityPoolParams.assetSymbol.unCurrencySymbol +
            fromText(asset)
        ] -
        fromSPInteger(withdrawnAmt) -
        withdrawalFeeAmount;

      tx.pay.ToContract(
        stabilityPoolUtxo.address,
        {
          kind: 'inline',
          value: serialiseStabilityPoolDatum({
            StabilityPool: {
              content: {
                ...stabilityPoolDatum,
                snapshot: newPoolSnapshot,
              },
            },
          }),
        },
        {
          lovelace: stabilityPoolUtxo.assets.lovelace - reward,
          [params.stabilityPoolParams.stabilityPoolToken[0].unCurrencySymbol +
          fromText(
            params.stabilityPoolParams.stabilityPoolToken[1].unTokenName,
          )]: 1n,
          ...(assetOutputAmountForSP > 0n
            ? {
                [params.stabilityPoolParams.assetSymbol.unCurrencySymbol +
                fromText(asset)]: assetOutputAmountForSP,
              }
            : {}),
        },
      );

      if (myAddress !== outputAddress) {
        tx.pay.ToAddressWithData(
          outputAddress,
          {
            kind: 'inline',
            value: Data.to(
              {
                IndigoStabilityPoolAccountClosure: {
                  closed_account: {
                    txHash: { hash: accountUtxo.txHash },
                    outputIndex: BigInt(accountUtxo.outputIndex),
                  },
                },
              },
              ActionReturnDatum,
            ),
          },
          {
            lovelace: accountUtxo.assets.lovelace + reward - rewardLovelacesFee,
            [params.stabilityPoolParams.assetSymbol.unCurrencySymbol +
            fromText(asset)]: fromSPInteger(withdrawnAmt) - withdrawalFeeAmount,
          },
        );
      }
    }

    return tx;
  }
}
