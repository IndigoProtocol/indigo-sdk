import { Data, Datum } from '@lucid-evolution/lucid';
import { AssetClassSchema } from '../generic';
import { TreasuryWithdrawalSchema } from './gov';
import { option as O, function as F } from 'fp-ts';
import { ProposalContentSchema } from './gov-new';

const ExecuteParamsSchema = Data.Object({
  govNFT: AssetClassSchema,
  upgradeToken: AssetClassSchema,
  iAssetToken: AssetClassSchema,
  stabilityPoolToken: AssetClassSchema,
  versionRecordToken: AssetClassSchema,
  cdpValHash: Data.Bytes(),
  sPoolValHash: Data.Bytes(),
  versionRegistryValHash: Data.Bytes(),
  treasuryValHash: Data.Bytes(),
  indyAsset: AssetClassSchema,
});
export type ExecuteParams = Data.Static<typeof ExecuteParamsSchema>;
export const ExecuteParams = ExecuteParamsSchema as unknown as ExecuteParams;

const ExecuteDatumSchema = Data.Object({
  id: Data.Integer(),
  content: ProposalContentSchema,
  passedTime: Data.Integer(),
  votingEndTime: Data.Integer(),
  protocolVersion: Data.Integer(),
  /// Value proposed to be withdrawn from the treasury as part of the proposal.
  treasuryWithdrawal: Data.Nullable(TreasuryWithdrawalSchema),
});
export type ExecuteDatum = Data.Static<typeof ExecuteDatumSchema>;
export const ExecuteDatum = ExecuteDatumSchema as unknown as ExecuteDatum;

export function serialiseExecuteDatum(d: ExecuteDatum): Datum {
  return Data.to<ExecuteDatum>(d, ExecuteDatum);
}

export function parseExecuteDatum(d: Datum): O.Option<ExecuteDatum> {
  try {
    return O.some(Data.from<ExecuteDatum>(d, ExecuteDatum));
  } catch (_) {
    return O.none;
  }
}

export function parseExecuteDatumOrThrow(d: Datum): ExecuteDatum {
  return F.pipe(
    parseExecuteDatum(d),
    O.match(() => {
      throw new Error('Expected an Execute datum.');
    }, F.identity),
  );
}

export function castExecuteParams(params: ExecuteParams): Data {
  return Data.castTo(params, ExecuteParams);
}
