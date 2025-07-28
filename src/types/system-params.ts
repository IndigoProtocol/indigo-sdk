interface OnChainDecimal {
  getOnChainInt: bigint;
}

interface CurrencySymbol {
  unCurrencySymbol: string;
}

interface TokenName {
  unTokenName: string;
}

type AssetClass = [CurrencySymbol, TokenName];

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
  indyToken: AssetClass;
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
    tag:string;
    contents:string;
  };
}
export interface PubKeyHash {
  getPubKeyHash: string;
}
export interface VersionRecordParams {
  upgradeToken: AssetClass;
}
export interface TreasuryParams {
  upgradeToken: AssetClass;
  versionRecordToken: AssetClass;
  treasuryUtxosStakeCredential?: ScriptCredential;
}
export interface StartTime {
  slot: number;
  blockHeader: string;
}
export interface StakingParams {
  versionRecordToken: AssetClass;
  stakingToken: AssetClass;
  stakingManagerNFT: AssetClass;
  pollToken: AssetClass;
  indyToken: AssetClass;
  collectorValHash: string;
}
export interface StabilityPoolParams {
  versionRecordToken: AssetClass;
  stabilityPoolToken: AssetClass;
  snapshotEpochToScaleToSumToken: AssetClass;
  requestCollateralLovelaces: number;
  iAssetAuthToken: AssetClass;
  govNFT: AssetClass;
  collectorValHash: string;
  cdpToken: AssetClass;
  assetSymbol: CurrencySymbol;
  accountToken: AssetClass;
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
  address: Address;
}
export interface AddressCredentialOrDatum {
  tag: string;
  contents: string;
}
export interface Amount {
  getValue?:
    | ((CurrencySymbol | ((number)[] | null)[] | null)[] | null)[]
    | null;
}
export interface Address {
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
  stakingToken: AssetClass;
  pollToken: AssetClass;
  indyAsset: AssetClass;
}

export interface PollManagerParams {
  upgradeToken: AssetClass;
  treasuryValHash: string;
  shardsValHash: string;
  pollToken: AssetClass;
  pBiasTime: number;
  initialIndyDistribution: number;
  indyAsset: AssetClass;
  govNFT: AssetClass;
  govExecuteValHash: string;
}

export interface GovParams {
  versionRecordToken: AssetClass;
  upgradeToken: AssetClass;
  pollToken: AssetClass;
  pollManagerValHash: string;
  indyAsset: AssetClass;
  iAssetAuthToken: AssetClass;
  govNFT: AssetClass;
  gBiasTime: number;
  daoIdentityToken: AssetClass;
}
export interface ExecuteParams {
  versionRegistryValHash: string;
  versionRecordToken: AssetClass;
  upgradeToken: AssetClass;
  treasuryValHash: string;
  stabilityPoolToken: AssetClass;
  sPoolValHash: string;
  maxInterestPeriods: number;
  iAssetToken: AssetClass;
  govNFT: AssetClass;
  cdpValHash: string;
}
export interface DistributionParams {
  treasuryIndyAmount: number;
  totalINDYSupply: number;
  initialIndyDistribution: number;
}
export interface CollectorParams {
  versionRecordToken: AssetClass;
  stakingToken: AssetClass;
  stakingManagerNFT: AssetClass;
}
export interface CdpParams {
  versionRecordToken: AssetClass;
  upgradeToken: AssetClass;
  treasuryValHash: string;
  stabilityPoolAuthToken: AssetClass;
  spValHash: string;
  partialRedemptionExtraFeeLovelace: number;
  minCollateralInLovelace: number;
  iAssetAuthToken: AssetClass;
  govNFT: AssetClass;
  collectorValHash: string;
  cdpAuthToken: AssetClass;
  cdpAssetSymbol: CurrencySymbol;
  biasTime: number;
}

export interface CdpCreatorParams {
  versionRecordToken: AssetClass;
  minCollateralInLovelace: number;
  iAssetAuthTk: AssetClass;
  collectorValHash: string;
  cdpScriptHash: string;
  cdpCreatorNft: AssetClass;
  cdpAuthTk: AssetClass;
  cdpAssetCs: CurrencySymbol;
  biasTime: number;
}
