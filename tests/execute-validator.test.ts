import { describe, expect, it } from 'vitest';
import { loadSystemParamsFromFile, StakingContract, StabilityPoolContract, CollectorContract, CDPContract, mkCDPCreatorValidatorFromSP, castExecuteParams, fromSystemParamsAsset, ExecuteParams } from '../src';
import { Data, validatorToScriptHash } from '@lucid-evolution/lucid';
import { mkExecuteValidatorFromSP } from '../src/scripts/execute-validator';

const systemParams = loadSystemParamsFromFile(
  './tests/data/system-params.json',
);

describe('Execute Validator issue', () => {

  it('Execute parameters', () => {
    expect(
      Data.to(castExecuteParams({
        govNFT: fromSystemParamsAsset(systemParams.executeParams.govNFT),
        upgradeToken: fromSystemParamsAsset(systemParams.executeParams.upgradeToken),
        iAssetToken: fromSystemParamsAsset(systemParams.executeParams.iAssetToken),
        stabilityPoolToken: fromSystemParamsAsset(systemParams.executeParams.stabilityPoolToken),
        versionRecordToken: fromSystemParamsAsset(systemParams.executeParams.versionRecordToken),
        cdpValHash: systemParams.executeParams.cdpValHash,
        sPoolValHash: systemParams.executeParams.sPoolValHash,
        versionRegistryValHash: systemParams.executeParams.versionRegistryValHash,
        treasuryValHash: systemParams.executeParams.treasuryValHash,
        indyAsset: fromSystemParamsAsset(systemParams.executeParams.indyAsset)
      } as ExecuteParams))
    ).toBe('d8799fd8799f581c2fccae8bc1c8553a2185b2e77ccdea22f2e1d6e87beb80ef4eaf8cce47474f565f4e4654ffd8799f581cca72f111cc130ac311259181e0720516c044cee30704706a0299c2a84755504752414445ffd8799f581c97da12de04a6b527cc3b3469c5e5485cf258dfd1021f12e728f2e71446494153534554ffd8799f581c3f28fb7d6c40468262dffb1c3adb568b342499826b664d940085d0224e53544142494c4954595f504f4f4cffd8799f581cd626ddf398b0bca6e112cf0b78c8124b989a6ca4e7c0dfe8c18c7c2e4e56455253494f4e5f5245434f5244ff581c0805d8541db33f4841585fed4c3a7e87e2ff7018243038f06ceb660c581c88e0299018563dd10c4860d9f34eda56fdb77f302da0e3980620535c581cea84d625650d066e1645e3e81d9c70a73f9ed837bd96dc49850ae744581c3bd5f8ba0100f39952472619abfddb52d941a5347b88635e874a7b37d8799f581c533bb94a8850ee3ccbe483106489399112b74c905342cb1792a797a044494e4459ffff');
  });
  it('Execute validator hash', () => {
    expect(
      validatorToScriptHash(mkExecuteValidatorFromSP(systemParams.executeParams)),
    ).toBe('e0612a2268eab843de10df4d02aaeafbc915b537dfe6ce1fc6e8d323');
  });
});
