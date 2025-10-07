import { Data, Datum } from '@lucid-evolution/lucid';
import { ProposalContentSchema, TreasuryWithdrawalSchema } from './gov';
import { AddressSchema } from '../generic';
import { option as O, function as F } from 'fp-ts';
import { match, P } from 'ts-pattern';

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
export type PollManagerContent = Data.Static<typeof PollManagerContentSchema>;

const PollShardContentSchema = Data.Object({
  pollId: Data.Integer(),
  status: PollStatusSchema,
  votingEndTime: Data.Integer(),
  managerAddress: AddressSchema,
});
export type PollShardContent = Data.Static<typeof PollShardContentSchema>;

const PollDatumSchema = Data.Enum([
  Data.Object({
    PollManager: Data.Object({ content: PollManagerContentSchema }),
  }),
  Data.Object({ PollShard: Data.Object({ content: PollShardContentSchema }) }),
]);
export type PollDatum = Data.Static<typeof PollDatumSchema>;
export const PollDatum = PollDatumSchema as unknown as PollDatum;

export function parsePollManager(datum: Datum): O.Option<PollManagerContent> {
  try {
    return match(Data.from<PollDatum>(datum, PollDatum))
      .with({ PollManager: P.select() }, (res) => O.some(res.content))
      .otherwise(() => O.none);
  } catch (_) {
    return O.none;
  }
}

export function parsePollManagerOrThrow(datum: Datum): PollManagerContent {
  return F.pipe(
    parsePollManager(datum),
    O.match(() => {
      throw new Error('Expected a Poll manager datum.');
    }, F.identity),
  );
}

export function serialisePollDatum(datum: PollDatum): Datum {
  return Data.to<PollDatum>(datum, PollDatum);
}
