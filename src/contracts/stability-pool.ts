import {
  applyParamsToScript,
  Constr,
  fromText,
  LucidEvolution,
  TxBuilder,
  validatorToScriptHash,
  SpendingValidator,
  Data,
  validatorToAddress,
  Address,
  UTxO,
  paymentCredentialOf,
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
} from '../types/indigo/stability-pool';
import {
  ScriptReferences,
  StabilityPoolParamsSP,
  SystemParams,
} from '../types/system-params';
import { addrDetails, scriptRef } from '../helpers/lucid-utils';
import { mkStabilityPoolValidatorFromSP } from '../scripts/stability-pool-validator';

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
          request: {
            Create: {},
          },
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
    const [pkh, skh] = await addrDetails(lucid);

    const stabilityPoolScriptRef = await scriptRef(
      params.scriptReferences.stabilityPoolValidatorRef,
      lucid,
    );

    const request: AccountAction = {
      Adjust: {
        amount: amount,
        outputAddress: {
          paymentCredential: {
            PublicKeyCredential: [pkh.hash],
          },
          stakeCredential: {
            Inline: [{ PublicKeyCredential: [skh.hash] }],
          },
        },
      },
    };
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
          request: request,
        },
      },
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
        { kind: 'inline', value: serialiseStabilityPoolDatum(datum) },
        {
          lovelace: 5_000_000n,
          [params.stabilityPoolParams.assetSymbol.unCurrencySymbol +
          fromText(asset)]: amount,
        },
      )
      .addSignerKey(pkh.hash);
  }

  static async closeAccount(
    asset: string,
    accountUtxo: UTxO,
    params: SystemParams,
    lucid: LucidEvolution,
  ): Promise<TxBuilder> {
    const [pkh, skh] = await addrDetails(lucid);

    const stabilityPoolScriptRef = await scriptRef(
      params.scriptReferences.stabilityPoolValidatorRef,
      lucid,
    );

    const request: AccountAction = {
      Close: {
        outputAddress: {
          paymentCredential: {
            PublicKeyCredential: [pkh.hash],
          },
          stakeCredential: {
            Inline: [{ PublicKeyCredential: [skh.hash] }],
          },
        },
      },
    };
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
          request: request,
        },
      },
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
        { kind: 'inline', value: serialiseStabilityPoolDatum(datum) },
        {
          lovelace: 5_000_000n,
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

    if (!accountDatum.request) throw 'Account Request is null';
    if (accountDatum.request == 'Create' || 'Create' in accountDatum.request) {
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
          value:
            accountDatum.snapshot.depositVal.value + mkSPInteger(reqAmount),
        },
      };

      const newDeposit =
        stabilityPoolDatum.snapshot.depositVal.value + mkSPInteger(reqAmount);
      const newSum =
        stabilityPoolDatum.snapshot.sumVal.value +
        spDiv(
          spMul(
            mkSPInteger(
              BigInt(params.stabilityPoolParams.accountCreateFeeLovelaces),
            ),
            stabilityPoolDatum.snapshot.productVal.value,
          ),
          newDeposit,
        );
      const newStabilityPoolSnapshot: StabilityPoolSnapshot = {
        ...stabilityPoolDatum.snapshot,
        depositVal: { value: newDeposit },
        sumVal: { value: newSum },
      };

      const newEpochToScaleToSum: EpochToScaleToSum = new Map(
        stabilityPoolDatum.epochToScaleToSum,
      );
      newEpochToScaleToSum.set(
        {
          epoch: stabilityPoolDatum.snapshot.epoch,
          scale: stabilityPoolDatum.snapshot.scale,
        },
        { sum: newSum },
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
      throw 'Not implemented';
    } else if ('Close' in accountDatum.request) {
      throw 'Not implemented';
    }

    return tx;
  }
}
