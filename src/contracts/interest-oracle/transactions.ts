import {
  fromText,
  LucidEvolution,
  toUnit,
  TxBuilder,
  UTxO,
  validatorToAddress,
} from '@lucid-evolution/lucid';
import { UTxOOrOutRef } from '../../utils/lucid-utils';
import { AssetClass } from '../../types/generic';
import {
  InterestOracleParams,
  parseInterestOracleDatum,
  serialiseFeedInterestOracleRedeemer,
  serialiseInterestOracleDatum,
} from './types';
import { oneShotMintTx } from '../one-shot/transactions';
import { mkInterestOracleValidator } from './scripts';
import { findInterestOracle } from '../../../tests/queries/interest-oracle-queries';
import { ONE_SECOND } from '../../utils/time-helpers';
import { calculateUnitaryInterestSinceOracleLastUpdated } from '../interest-oracle/helpers';
import { getInlineDatumOrThrow } from '../../utils/lucid-utils';

export async function startInterestOracle(
  initialUnitaryInterest: bigint,
  initialInterestRate: bigint,
  initialLastInterestUpdate: bigint,
  oracleParams: InterestOracleParams,
  lucid: LucidEvolution,
  interestTokenName?: string,
  withScriptRef: boolean = false,
  refUtxo?: UTxOOrOutRef,
): Promise<[TxBuilder, AssetClass]> {
  const network = lucid.config().network!;

  const tokenName = interestTokenName ?? 'INTEREST_ORACLE';
  if (!refUtxo) {
    refUtxo = (await lucid.wallet().getUtxos())[0];
  }

  const [tx, policyId] = await oneShotMintTx(lucid, {
    referenceOutRef: {
      txHash: refUtxo.txHash,
      outputIdx: BigInt(refUtxo.outputIndex),
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
    validatorToAddress(network, validator),
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
      validatorToAddress(network, validator),
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

export async function feedInterestOracle(
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
    utxo = await findInterestOracle(lucid, assetClass);
  }

  const now = BigInt(Date.now());
  const tx = lucid.newTx();
  const datum = parseInterestOracleDatum(getInlineDatumOrThrow(utxo!));

  if (scriptRef) {
    tx.readFrom([scriptRef]);
  } else {
    tx.attach.Script(mkInterestOracleValidator(params));
  }

  tx.collectFrom(
    [utxo!],
    serialiseFeedInterestOracleRedeemer({
      newInterestRate: {
        getOnChainInt: newInterestRate,
      },
      currentTime: now,
    }),
  );

  tx.pay.ToContract(
    utxo!.address,
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
    utxo!.assets,
  );

  tx.validFrom(Number(now) - ONE_SECOND);
  tx.validTo(Number(now + params.biasTime) - ONE_SECOND);

  tx.addSignerKey(params.owner);

  return tx;
}
