import { Data, Datum } from '@lucid-evolution/lucid';
import { AssetClassSchema } from '../generic';
import { OnChainDecimalSchema } from '../on-chain-decimal';
import { OracleAssetNftSchema } from './price-oracle';
import { IAssetPriceInfoSchema } from './cdp';

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

const ProtocolParamsSchema = Data.Object({
  proposalDeposit: Data.Integer(),
  votingPeriod: Data.Integer(),
  effectiveDelay: Data.Integer(),
  expirationPeriod: Data.Integer(),
  collateralFeePercentage: OnChainDecimalSchema,
  proposingPeriod: Data.Integer(),
  /// Total numer of shards used for voting.
  totalShards: Data.Integer(),
  /// The minimum number of votes (yes + no votes) for a proposal to be possible to pass.
  minimumQuorum: Data.Integer(),
  /// Maximum amount of lovelaces that can be spent at once from the treasury.
  maxTreasuryLovelaceSpend: Data.Integer(),
  /// Maximum amount of INDY that can be spent at once from the treasury.
  maxTreasuryIndySpend: Data.Integer(),
});

export type ProtocolParams = Data.Static<typeof ProtocolParamsSchema>;
export const ProtocolParams = ProtocolParamsSchema as unknown as ProtocolParams;

const ValueWithdrawalItemSchema = Data.Tuple(
  [Data.Bytes(), Data.Bytes(), Data.Integer()],
  { hasConstr: true },
);

export const TreasuryWithdrawalSchema = Data.Object({
  destination: Data.Bytes(),
  value: Data.Array(ValueWithdrawalItemSchema),
});

const UpgradePathSchema = Data.Object({
  upgradeSymbol: Data.Bytes(),
});

const UpgradePathsSchema = Data.Object({
  upgradeId: Data.Integer(),
  /// Underlying representation of the following mapping: ValidatorHash -> UpgradePath
  upgradePaths: Data.Array(Data.Tuple([Data.Bytes(), UpgradePathSchema])),
});

export const ProposalContentSchema = Data.Enum([
  Data.Object({
    ProposeAsset: Data.Object({
      asset: Data.Bytes(),
      priceOracleNft: OracleAssetNftSchema,
      interestOracleNft: AssetClassSchema,
      redemptionRatioPercentage: OnChainDecimalSchema,
      maintenanceRatioPercentage: OnChainDecimalSchema,
      liquidationRatioPercentage: OnChainDecimalSchema,
      debtMintingFeePercentage: OnChainDecimalSchema,
      liquidationProcessingFeePercentage: OnChainDecimalSchema,
      stabilityPoolWithdrawalFeePercentage: OnChainDecimalSchema,
      redemptionReimbursementPercentage: OnChainDecimalSchema,
      redemptionProcessingFeePercentage: OnChainDecimalSchema,
      interestCollectorPortionPercentage: OnChainDecimalSchema,
    }),
  }),
  Data.Object({
    ModifyAsset: Data.Object({
      asset: Data.Bytes(),
      newAssetPriceInfo: IAssetPriceInfoSchema,
      newInterestOracleNft: AssetClassSchema,
      newRedemptionRatioPercentage: OnChainDecimalSchema,
      newMaintenanceRatioPercentage: OnChainDecimalSchema,
      newLiquidationRatioPercentage: OnChainDecimalSchema,
      newDebtMintingFeePercentage: OnChainDecimalSchema,
      newLiquidationProcessingFeePercentage: OnChainDecimalSchema,
      newStabilityPoolWithdrawalFeePercentage: OnChainDecimalSchema,
      newRedemptionReimbursementPercentage: OnChainDecimalSchema,
      newRedemptionProcessingFeePercentage: OnChainDecimalSchema,
      newInterestCollectorPortionPercentage: OnChainDecimalSchema,
    }),
  }),
  Data.Object({
    ModifyProtocolParams: Data.Object({
      newParams: ProtocolParamsSchema,
    }),
  }),
  Data.Object({ UpgradeProtocol: UpgradePathsSchema }),
  Data.Object({ TextProposal: Data.Bytes() }),
]);

export type ProposalContent = Data.Static<typeof ProposalContentSchema>;
export const ProposalContent =
  ProposalContentSchema as unknown as ProposalContent;

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

export function castGovParams(params: GovParams): Data {
  return Data.castTo(params, GovParams);
}
