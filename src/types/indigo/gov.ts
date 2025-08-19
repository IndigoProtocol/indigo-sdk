import { Data } from "@lucid-evolution/lucid";
import { AssetClassSchema } from "../generic";

export type ProtocolParams = {
  proposalDeposit: bigint;
  votingPeriod: bigint;
  effectiveDelay: bigint;
  expirationPeriod: bigint;
  collateralFeePercentage: bigint;
  proposingPeriod: bigint;
  totalShards: bigint;
  minimumQuorum: bigint;
  maxTreasuryLovelaceSpend: bigint;
  maxTreasuryIndySpend: bigint;
};

export type GovDatum = {
  currentProposal: bigint;
  protocolParams: ProtocolParams;
  currentVersion: bigint;
  iassetsCount: bigint;
  activeProposals: bigint;
  treasuryIndyWithdrawnAmt: bigint;
};

const GovParamsSchema = Data.Object({
  gBiasTime: Data.Integer(),
  govNFT: AssetClassSchema,
  pollToken: AssetClassSchema,
  upgradeToken: AssetClassSchema,
  indyAsset: AssetClassSchema,
  versionRecordToken: AssetClassSchema,
  pollManagerValHash: Data.Bytes(),
  daoIdentityToken: AssetClassSchema,
  iAssetAuthToken: AssetClassSchema,
});
export type GovParams = Data.Static<typeof GovParamsSchema>;
export const GovParams = GovParamsSchema as unknown as GovParams;

export function castGovParams(params: GovParams): Data {
  return Data.castTo(params, GovParams);
}