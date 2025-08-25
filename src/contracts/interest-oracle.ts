import {
  fromText,
  LucidEvolution,
  OutRef,
  PolicyId,
  toUnit,
  TxBuilder,
  validatorToAddress,
} from '@lucid-evolution/lucid';
import { AssetClass } from '../types/generic';
import {
  InterestOracleParams,
  serialiseInterestOracleDatum,
} from '../types/indigo/interest-oracle';
import { addrDetails } from '../helpers/lucid-utils';
import { oneShotMintTx } from './one-shot';
import { mkInterestOracleValidator } from '../scripts/interest-oracle-validator';

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
    const [tx, policyId] = await oneShotMintTx(lucid, {
      referenceOutRef: {
        txHash: refOutRef.txHash,
        outputIdx: BigInt(refOutRef.outputIndex),
      },
      mintAmounts: [
        {
          tokenName: tokenName,
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
}
