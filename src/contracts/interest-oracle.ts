import {
  fromText,
  LucidEvolution,
  OutRef,
  toUnit,
  TxBuilder,
  UTxO,
  validatorToAddress,
} from '@lucid-evolution/lucid';
import { AssetClass } from '../types/generic';
import {
  InterestOracleParams,
  parseInterestOracleDatum,
  serialiseFeedInterestOracleRedeemer,
  serialiseInterestOracleDatum,
} from '../types/indigo/interest-oracle';
import { oneShotMintTx } from './one-shot';
import { mkInterestOracleValidator } from '../scripts/interest-oracle-validator';
import { findInterestOracle } from '../../tests/queries/interest-oracle-queries';
import { ONE_SECOND } from '../helpers/time-helpers';
import { calculateUnitaryInterestSinceOracleLastUpdated } from '../helpers/interest-oracle';

export class InterestOracleContract {
  static async startInterestOracle(
    initialUnitaryInterest: bigint,
    initialInterestRate: bigint,
    initialLastInterestUpdate: bigint,
    oracleParams: InterestOracleParams,
    lucid: LucidEvolution,
    withScriptRef: boolean = false,
    refOutRef?: OutRef,
    interestTokenName?: string,
  ): Promise<[TxBuilder, AssetClass]> {
    const tokenName = interestTokenName ?? 'INTEREST_ORACLE';
    if (!refOutRef) {
      refOutRef = (await lucid.wallet().getUtxos())[0];
    }

    const [tx, policyId] = await oneShotMintTx(lucid, {
      referenceOutRef: {
        txHash: refOutRef.txHash,
        outputIdx: BigInt(refOutRef.outputIndex),
      },
      mintAmounts: [
        {
          tokenName: fromText(tokenName),
          amount: 1n,
        },
      ],
    });

    const validator = mkInterestOracleValidator(oracleParams);

    tx.pay.ToContract(
      validatorToAddress(lucid.config().network, validator),
      {
        kind: 'inline',
        value: serialiseInterestOracleDatum({
          unitaryInterest: initialUnitaryInterest,
          interestRate: {
            getOnChainInt: initialInterestRate,
          },
          lastUpdated: initialLastInterestUpdate,
        }),
      },
      {
        lovelace: 2_500_000n,
        [toUnit(policyId, fromText(tokenName))]: 1n,
      },
    );

    if (withScriptRef) {
      tx.pay.ToAddressWithData(
        validatorToAddress(lucid.config().network, validator),
        undefined,
        undefined,
        validator,
      );
    }

    return [
      tx,
      {
        currencySymbol: policyId,
        tokenName: fromText(tokenName),
      },
    ];
  }

  static async feedInterestOracle(
    params: InterestOracleParams,
    newInterestRate: bigint,
    lucid: LucidEvolution,
    assetClass?: AssetClass,
    utxo?: UTxO,
    scriptRef?: UTxO,
  ): Promise<TxBuilder> {
    if (!assetClass && !utxo)
      throw new Error('Either interest oracle nft or utxo must be provided');
    if (assetClass && !utxo) {
      const [ioUtxo, _datum] = await findInterestOracle(lucid, assetClass);
      utxo = ioUtxo;
    }

    const now = BigInt(Date.now());
    const tx = lucid.newTx();
    const datum = parseInterestOracleDatum(utxo.datum);

    if (scriptRef) {
      tx.readFrom([scriptRef]);
    } else {
      tx.attach.Script(mkInterestOracleValidator(params));
    }

    tx.collectFrom(
      [utxo],
      serialiseFeedInterestOracleRedeemer({
        newInterestRate: {
          getOnChainInt: newInterestRate,
        },
        currentTime: now,
      }),
    );

    tx.pay.ToContract(
      utxo.address,
      {
        kind: 'inline',
        value: serialiseInterestOracleDatum({
          unitaryInterest:
            datum.unitaryInterest +
            calculateUnitaryInterestSinceOracleLastUpdated(now, datum),
          interestRate: {
            getOnChainInt: newInterestRate,
          },
          lastUpdated: now,
        }),
      },
      utxo.assets,
    );

    tx.validFrom(Number(now) - ONE_SECOND);
    tx.validTo(Number(now + params.biasTime) - ONE_SECOND);

    tx.addSignerKey(params.owner);

    return tx;
  }
}
