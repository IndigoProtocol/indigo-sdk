import { Core as EvoCore } from '@evolution-sdk/evolution';
import { Data } from '@lucid-evolution/lucid';
import { OracleAssetNftSchema } from '../price-oracle/types';
import { AssetClassSchema } from '../../types/generic';
import { OnChainDecimalSchema } from '../../types/on-chain-decimal';
import { IAssetPriceInfoSchema } from '../cdp/types';
import { DEFAULT_SCHEMA_OPTIONS } from '../../types/evolution-schema-options';

export const ProtocolParamsSchema = Data.Object({
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

const ProposeAssetContentSchema = Data.Object({
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
});
export type ProposeAssetContent = Data.Static<typeof ProposeAssetContentSchema>;

export const ProposalContentSchema = Data.Enum([
  Data.Object({
    ProposeAsset: ProposeAssetContentSchema,
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
  Data.Object({
    UpgradeProtocol: Data.Object({
      content:
        // NOTICE: This is replaced by evolution-sdk encoding of `UpgradePathsSchema` defined in this file.
        Data.Any(),
    }),
  }),
  Data.Object({
    TextProposal: Data.Object({
      bytes: Data.Bytes(),
    }),
  }),
]);
export type ProposalContent = Data.Static<typeof ProposalContentSchema>;
export const ProposalContent =
  ProposalContentSchema as unknown as ProposalContent;

const UpgradePathSchema = EvoCore.TSchema.Struct({
  upgradeSymbol: EvoCore.TSchema.ByteArray,
});

const UpgradePathsSchema = EvoCore.TSchema.Struct({
  upgradeId: EvoCore.TSchema.Integer,
  /// Underlying representation of the following mapping: ValidatorHash -> UpgradePath
  upgradePaths: EvoCore.TSchema.Map(
    EvoCore.TSchema.ByteArray,
    UpgradePathSchema,
  ),
});
export type UpgradePaths = typeof UpgradePathsSchema.Type;

export function serialiseUpgradePaths(d: UpgradePaths): Data {
  return Data.from(
    EvoCore.Data.withSchema(
      UpgradePathsSchema,
      DEFAULT_SCHEMA_OPTIONS,
    ).toCBORHex(d),
  );
}

export function parseUpgradePaths(d: Data): UpgradePaths {
  return EvoCore.Data.withSchema(
    UpgradePathsSchema,
    DEFAULT_SCHEMA_OPTIONS,
  ).fromCBORHex(Data.to(d));
}
