import { Data, Datum } from '@lucid-evolution/lucid';
import { ProposalContentSchema, TreasuryWithdrawalSchema } from './gov';
import { AddressSchema } from '../generic';

const PollStatusSchema = Data.Object({
  yesVotes: Data.Integer(),
  noVotes: Data.Integer(),
});

const PollManagerContentSchema = Data.Object({
  pollId: Data.Integer(),
  pollOwner: Data.Bytes(),
  content: ProposalContentSchema,
  treasuryWithdrawal: Data.Nullable(TreasuryWithdrawalSchema),
  status: PollStatusSchema,
  votingEndTime: Data.Integer(),
  createdShardsCount: Data.Integer(),
  talliedShardsCount: Data.Integer(),
  totalShardsCount: Data.Integer(),
  proposingEndTime: Data.Integer(),
  expirationTime: Data.Integer(),
  protocolVersion: Data.Integer(),
  minimumQuorum: Data.Integer(),
});
export type PollManager = Data.Static<typeof PollManagerContentSchema>;

const PollShardContentSchema = Data.Object({
  pollId: Data.Integer(),
  status: PollStatusSchema,
  votingEndTime: Data.Integer(),
  managerAddress: AddressSchema,
});
export type PollShard = Data.Static<typeof PollShardContentSchema>;

const PollDatumSchema = Data.Enum([
  Data.Object({ PollManager: PollManagerContentSchema }),
  Data.Object({ PollShard: PollShardContentSchema }),
]);
export type PollDatum = Data.Static<typeof PollDatumSchema>;
export const PollDatum = PollDatumSchema as unknown as PollDatum;

export function serialisePollDatum(datum: PollDatum): Datum {
  return Data.to<PollDatum>(datum, PollDatum);
}
