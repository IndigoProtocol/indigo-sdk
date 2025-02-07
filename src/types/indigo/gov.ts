export type ProtocolParams = {
    proposalDeposit: bigint,
    votingPeriod: bigint,
    effectiveDelay: bigint,
    expirationPeriod: bigint,
    collateralFeePercentage: bigint,
    proposingPeriod: bigint,
    totalShards: bigint,
    minimumQuorum: bigint,
    maxTreasuryLovelaceSpend: bigint,
    maxTreasuryIndySpend: bigint,
};

export type GovDatum = {
    currentProposal: bigint,
    protocolParams: ProtocolParams,
    currentVersion: bigint,
    iassetsCount: bigint,
    activeProposals: bigint,
    treasuryIndyWithdrawnAmt: bigint,
}