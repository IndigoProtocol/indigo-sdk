import { describe, expect, it } from 'vitest';
import { loadSystemParamsFromFile } from '../src/helpers/helpers';
import { CDPCreatorContract } from '../src/contracts/cdp-creator';
import { CDPContract, mkInterestOracleValidator } from '../src';
import { CollectorContract } from '../src/contracts/collector';
import { StabilityPoolContract } from '../src/contracts/stability-pool';
import { StakingContract } from '../src/contracts/staking';
import { validatorToScriptHash } from '@lucid-evolution/lucid';

const systemParams = loadSystemParamsFromFile(
  './tests/data/system-params.json',
);

describe('Validator Hash checks', () => {
  it('CDP Creator validator hash', () => {
    expect(
      CDPCreatorContract.validatorHash(systemParams.cdpCreatorParams),
    ).toBe(systemParams.validatorHashes.cdpCreatorHash);
  });
  it('CDP validator hash', () => {
    expect(CDPContract.validatorHash(systemParams.cdpParams)).toBe(
      systemParams.validatorHashes.cdpHash,
    );
  });
  it('Collector validator hash', () => {
    expect(CollectorContract.validatorHash(systemParams.collectorParams)).toBe(
      systemParams.validatorHashes.collectorHash,
    );
  });
  it('Staking validator hash', () => {
    expect(StakingContract.validatorHash(systemParams.stakingParams)).toBe(
      systemParams.validatorHashes.stakingHash,
    );
  });
  it('Stability Pool validator hash', () => {
    expect(
      StabilityPoolContract.validatorHash(systemParams.stabilityPoolParams),
    ).toBe(systemParams.validatorHashes.stabilityPoolHash);
  });

  it('Interest Oracle validator hash', () => {
    expect(
      validatorToScriptHash(mkInterestOracleValidator({
        biasTime: 1_200_000n,
        owner: 'a962c79bd58fc9fcecd78f8a963e0ce80e907264cd86cd5814d87333',
      })),
    ).toBe('b970b3e0e1b591840627e6919898c12ee57e2f0225ab03e056d10d52');
  });
});
