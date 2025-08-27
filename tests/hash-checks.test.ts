import { describe, expect, it } from 'vitest';
import {
  loadSystemParamsFromFile,
  StakingContract,
  CollectorContract,
  CDPContract,
  mkCDPCreatorValidatorFromSP,
} from '../src';
import { validatorToScriptHash } from '@lucid-evolution/lucid';
import { mkStabilityPoolValidatorFromSP } from '../src/scripts/stability-pool-validator';
import { mkGovValidatorFromSP } from '../src/scripts/gov-validator';

const systemParams = loadSystemParamsFromFile(
  './tests/data/system-params.json',
);

describe('Validator Hash checks', () => {
  it('CDP Creator validator hash', () => {
    expect(
      validatorToScriptHash(
        mkCDPCreatorValidatorFromSP(systemParams.cdpCreatorParams),
      ),
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
  // TODO: Revisit this test, issues with cbor encoding on Lucid?
  // Applying parameters to the validator using `aiken build` does not result in the same hash as the one generate by Lucid.
  // it('Execute validator hash', () => {
  //   expect(
  //     validatorToScriptHash(mkExecuteValidatorFromSP(systemParams.executeParams)),
  //   ).toBe(
  //     systemParams.validatorHashes.executeHash,
  //   );
  // });
  it('Gov validator hash', () => {
    expect(
      validatorToScriptHash(mkGovValidatorFromSP(systemParams.govParams)),
    ).toBe(systemParams.validatorHashes.govHash);
  });
  it('Staking validator hash', () => {
    expect(StakingContract.validatorHash(systemParams.stakingParams)).toBe(
      systemParams.validatorHashes.stakingHash,
    );
  });
  it('Stability Pool validator hash', () => {
    expect(
      validatorToScriptHash(
        mkStabilityPoolValidatorFromSP(systemParams.stabilityPoolParams),
      ),
    ).toBe(systemParams.validatorHashes.stabilityPoolHash);
  });
});
