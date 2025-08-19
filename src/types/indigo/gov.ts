import { Data, Datum } from '@lucid-evolution/lucid';
import { AssetClassSchema } from '../generic';
import { OnChainDecimalSchema } from '../on-chain-decimal';

const GovDatumSchema = Data.Object({
  currentProposal: Data.Integer(),
  protocolParams: Data.Object({
    proposalDeposit: Data.Integer(),
    votingPeriod: Data.Integer(),
    effectiveDelay: Data.Integer(),
    expirationPeriod: Data.Integer(),
    collateralFeePercentage: OnChainDecimalSchema,
    proposingPeriod: Data.Integer(),
    totalShards: Data.Integer(),
    minimumQuorum: Data.Integer(),
    maxTreasuryLovelaceSpend: Data.Integer(),
    maxTreasuryIndySpend: Data.Integer(),
  }),
  currentVersion: Data.Integer(),
  iassetsCount: Data.Integer(),
  activeProposals: Data.Integer(),
  treasuryIndyWithdrawnAmt: Data.Integer(),
});
export type GovDatum = Data.Static<typeof GovDatumSchema>;
const GovDatum = GovDatumSchema as unknown as GovDatum;

export function parseGovDatum(datum: Datum): GovDatum {
  return Data.from<GovDatum>(datum, GovDatum);
}

export function serialiseGovDatum(d: GovDatum): Datum {
  return Data.to<GovDatum>(d, GovDatum);
}

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

export function castGovParams(params: GovParams): Data {
  return Data.castTo(params, GovParams);
}
