export type LockedAmount = {
    pollId: bigint;
    expiration: bigint;
}

export type RewardSnapshot = {
    snapshotAda: bigint;
}

export type StakingPosition = {
    type: 'StakingPosition';
    owner: string;
    lockedAmount: Map<bigint, [bigint, bigint]>;
    snapshot: RewardSnapshot;
}

export type StakingManager = {
    type: 'StakingManager';
    totalStaked: bigint;
    snapshot: RewardSnapshot;
};

export type StakingDatum = StakingPosition | StakingManager;