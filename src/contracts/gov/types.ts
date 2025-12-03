import { Data, Datum, Redeemer } from '@lucid-evolution/lucid';
import { AddressSchema, AssetClassSchema } from '../../types/generic';
import { option as O, function as F } from 'fp-ts';
import { ProposalContentSchema, ProtocolParamsSchema } from './types-new';

const GovDatumSchema = Data.Object({
  currentProposal: Data.Integer(),
  protocolParams: ProtocolParamsSchema,
  currentVersion: Data.Integer(),
  iassetsCount: Data.Integer(),
  activeProposals: Data.Integer(),
  treasuryIndyWithdrawnAmt: Data.Integer(),
});
export type GovDatum = Data.Static<typeof GovDatumSchema>;
const GovDatum = GovDatumSchema as unknown as GovDatum;

const GovParamsSchema = Data.Object({
  govNFT: AssetClassSchema,
  pollToken: AssetClassSchema,
  upgradeToken: AssetClassSchema,
  indyAsset: AssetClassSchema,
  versionRecordToken: AssetClassSchema,
  pollManagerValHash: Data.Bytes(),
  gBiasTime: Data.Integer(),
  daoIdentityToken: AssetClassSchema,
  iAssetAuthToken: AssetClassSchema,
});
export type GovParams = Data.Static<typeof GovParamsSchema>;
export const GovParams = GovParamsSchema as unknown as GovParams;

const ValueWithdrawalItemSchema = Data.Tuple(
  [Data.Bytes(), Data.Bytes(), Data.Integer()],
  { hasConstr: true },
);
export type TreasuryWithdrawalItem = Data.Static<
  typeof ValueWithdrawalItemSchema
>;

export const TreasuryWithdrawalSchema = Data.Object({
  destination: AddressSchema,
  value: Data.Array(ValueWithdrawalItemSchema),
});
export type TreasuryWithdrawal = Data.Static<typeof TreasuryWithdrawalSchema>;

const GovRedeemerSchema = Data.Enum([
  Data.Object({
    CreatePoll: Data.Object({
      currentTime: Data.Integer(),
      proposalOwner: Data.Bytes(),
      content: ProposalContentSchema,
      treasuryWithdrawal: Data.Nullable(TreasuryWithdrawalSchema),
    }),
  }),
  Data.Object({ WitnessEndPoll: Data.Object({ currentTime: Data.Integer() }) }),
  Data.Literal('UpgradeGov'),
  Data.Literal('UpgradeVersion'),
]);

export type GovRedeemer = Data.Static<typeof GovRedeemerSchema>;
export const GovRedeemer = GovRedeemerSchema as unknown as GovRedeemer;

export function parseGovDatum(datum: Datum): O.Option<GovDatum> {
  try {
    return O.some(Data.from<GovDatum>(datum, GovDatum));
  } catch (_) {
    return O.none;
  }
}

export function parseGovDatumOrThrow(datum: Datum): GovDatum {
  return F.pipe(
    parseGovDatum(datum),
    O.match(() => {
      throw new Error('Expected a Gov datum.');
    }, F.identity),
  );
}

export function serialiseGovDatum(d: GovDatum): Datum {
  return Data.to<GovDatum>(d, GovDatum);
}

export function serialiseGovRedeemer(redeemer: GovRedeemer): Redeemer {
  return Data.to<GovRedeemer>(redeemer, GovRedeemer);
}

export function castGovParams(params: GovParams): Data {
  return Data.castTo(params, GovParams);
}
