import { CurrencySymbol, TokenName } from './generic';

/**
 * AssetClassSP used in System Params
 */
export type AssetClassSP = [CurrencySymbol, TokenName];

export interface SystemParams {
  versionRecordParams: VersionRecordParams;
  validatorHashes: ValidatorHashes;
  treasuryParams: TreasuryParams;
  startTime: StartTime;
  stakingParams: StakingParams;
  stabilityPoolParams: StabilityPoolParams;
  scriptReferences: ScriptReferences;
  pollShardParams: PollShardParams;
  pollManagerParams: PollManagerParams;
  indyToken: AssetClassSP;
  govParams: GovParams;
  executeParams: ExecuteParams;
  distributionParams: DistributionParams;
  collectorParams: CollectorParams;
  cdpParams: CdpParams;
  cdpCreatorParams: CdpCreatorParams;
}
export type ValidatorHashes = {
  versionRegistryHash: string;
  treasuryHash: string;
  stakingHash: string;
  stabilityPoolHash: string;
  pollShardHash: string;
  pollManagerHash: string;
  govHash: string;
  executeHash: string;
  collectorHash: string;
  cdpHash: string;
  cdpCreatorHash: string;
};
export interface AddressCredential {
  tag: string;
  contents: PubKeyHash;
}

export interface ScriptCredential {
  tag: string;
  contents: {
    tag: string;
    contents: string;
  };
}
export interface PubKeyHash {
  getPubKeyHash: string;
}
export interface VersionRecordParams {
  upgradeToken: AssetClassSP;
}
export interface TreasuryParams {
  upgradeToken: AssetClassSP;
  versionRecordToken: AssetClassSP;
  treasuryUtxosStakeCredential?: ScriptCredential;
}
export interface StartTime {
  slot: number;
  blockHeader: string;
}
export interface StakingParams {
  versionRecordToken: AssetClassSP;
  stakingToken: AssetClassSP;
  stakingManagerNFT: AssetClassSP;
  pollToken: AssetClassSP;
  indyToken: AssetClassSP;
  collectorValHash: string;
}
export interface StabilityPoolParams {
  versionRecordToken: AssetClassSP;
  stabilityPoolToken: AssetClassSP;
  snapshotEpochToScaleToSumToken: AssetClassSP;
  requestCollateralLovelaces: number;
  iAssetAuthToken: AssetClassSP;
  govNFT: AssetClassSP;
  collectorValHash: string;
  cdpToken: AssetClassSP;
  assetSymbol: CurrencySymbol;
  accountToken: AssetClassSP;
  accountCreateFeeLovelaces: number;
  accountAdjustmentFeeLovelaces: number;
}

export interface ScriptReferences {
  vestingValidatorRef: ScriptReference;
  versionRegistryValidatorRef: ScriptReference;
  versionRecordTokenPolicyRef: ScriptReference;
  treasuryValidatorRef: ScriptReference;
  stakingValidatorRef: ScriptReference;
  stabilityPoolValidatorRef: ScriptReference;
  pollShardValidatorRef: ScriptReference;
  pollManagerValidatorRef: ScriptReference;
  liquidityValidatorRef: ScriptReference;
  iAssetTokenPolicyRef: ScriptReference;
  governanceValidatorRef: ScriptReference;
  executeValidatorRef: ScriptReference;
  collectorValidatorRef: ScriptReference;
  cdpValidatorRef: ScriptReference;
  cdpCreatorValidatorRef: ScriptReference;
  authTokenPolicies: AuthTokenPolicies;
}
export interface Output {
  scriptRef: ScriptRef;
  output: ScriptOutput;
}
export interface ScriptRef {
  tag: string;
  contents?: string[] | null;
}
export interface ScriptOutput {
  referenceScript: string;
  datum: AddressCredentialOrDatum;
  amount: Amount;
  address: AddressSP;
}
export interface AddressCredentialOrDatum {
  tag: string;
  contents: string;
}
export interface Amount {
  getValue?: ((CurrencySymbol | (number[] | null)[] | null)[] | null)[] | null;
}
export interface AddressSP {
  addressStakingCredential?: null;
  addressCredential: AddressCredentialOrDatum;
}
export interface Input {
  transactionId: string;
  index: number;
}

export interface ScriptReference {
  output: Output;
  input: Input;
}

export interface AuthTokenPolicies {
  upgradeTokenRef: ScriptReference;
  stakingTokenRef: ScriptReference;
  stabilityPoolTokenRef: ScriptReference;
  snapshotEpochToScaleToSumTokenRef: ScriptReference;
  pollManagerTokenRef: ScriptReference;
  iAssetTokenRef: ScriptReference;
  cdpAuthTokenRef: ScriptReference;
  accountTokenRef: ScriptReference;
}

export interface PollShardParams {
  stakingValHash: string;
  stakingToken: AssetClassSP;
  pollToken: AssetClassSP;
  indyAsset: AssetClassSP;
}

export interface PollManagerParams {
  upgradeToken: AssetClassSP;
  treasuryValHash: string;
  shardsValHash: string;
  pollToken: AssetClassSP;
  pBiasTime: number;
  initialIndyDistribution: number;
  indyAsset: AssetClassSP;
  govNFT: AssetClassSP;
  govExecuteValHash: string;
}

export interface GovParams {
  versionRecordToken: AssetClassSP;
  upgradeToken: AssetClassSP;
  pollToken: AssetClassSP;
  pollManagerValHash: string;
  indyAsset: AssetClassSP;
  iAssetAuthToken: AssetClassSP;
  govNFT: AssetClassSP;
  gBiasTime: number;
  daoIdentityToken: AssetClassSP;
}
export interface ExecuteParams {
  versionRegistryValHash: string;
  versionRecordToken: AssetClassSP;
  upgradeToken: AssetClassSP;
  treasuryValHash: string;
  stabilityPoolToken: AssetClassSP;
  sPoolValHash: string;
  maxInterestPeriods: number;
  iAssetToken: AssetClassSP;
  govNFT: AssetClassSP;
  cdpValHash: string;
}
export interface DistributionParams {
  treasuryIndyAmount: number;
  totalINDYSupply: number;
  initialIndyDistribution: number;
}
export interface CollectorParams {
  versionRecordToken: AssetClassSP;
  stakingToken: AssetClassSP;
  stakingManagerNFT: AssetClassSP;
}
export interface CdpParams {
  versionRecordToken: AssetClassSP;
  upgradeToken: AssetClassSP;
  treasuryValHash: string;
  stabilityPoolAuthToken: AssetClassSP;
  spValHash: string;
  partialRedemptionExtraFeeLovelace: number;
  minCollateralInLovelace: number;
  iAssetAuthToken: AssetClassSP;
  govNFT: AssetClassSP;
  collectorValHash: string;
  cdpAuthToken: AssetClassSP;
  cdpAssetSymbol: CurrencySymbol;
  biasTime: number;
}

export interface CdpCreatorParams {
  versionRecordToken: AssetClassSP;
  minCollateralInLovelace: number;
  iAssetAuthTk: AssetClassSP;
  collectorValHash: string;
  cdpScriptHash: string;
  cdpCreatorNft: AssetClassSP;
  cdpAuthTk: AssetClassSP;
  cdpAssetCs: CurrencySymbol;
  biasTime: number;
}
