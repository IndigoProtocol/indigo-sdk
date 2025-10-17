import { Data, Datum } from '@lucid-evolution/lucid';
import { TreasuryWithdrawalSchema } from './gov';
import { AddressSchema } from '../generic';
import { option as O, function as F } from 'fp-ts';
import { match, P } from 'ts-pattern';
import { ProposalContentSchema } from './gov-new';

const PollStatusSchema = Data.Object({
  yesVotes: Data.Integer(),
  noVotes: Data.Integer(),
});
export type PollStatus = Data.Static<typeof PollStatusSchema>;

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

export function parsePollShard(datum: Datum): O.Option<PollShardContent> {
  try {
    return match(Data.from<PollDatum>(datum, PollDatum))
      .with({ PollShard: P.select() }, (res) => O.some(res.content))
      .otherwise(() => O.none);
  } catch (_) {
    return O.none;
  }
}

export function parsePollShardOrThrow(datum: Datum): PollShardContent {
  return F.pipe(
    parsePollShard(datum),
    O.match(() => {
      throw new Error('Expected a Poll shard datum.');
    }, F.identity),
  );
}

export function serialisePollDatum(datum: PollDatum): Datum {
  return Data.to<PollDatum>(datum, PollDatum);
}
