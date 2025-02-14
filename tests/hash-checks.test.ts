import { loadSystemParamsFromFile, loadSystemParamsFromUrl } from '../src/helpers';
import { CDPCreatorContract } from '../src/contracts/cdp-creator';
import { CDPContract, SystemParams } from '../src';
import { CollectorContract } from '../src/contracts/collector';

const systemParams = loadSystemParamsFromFile('./tests/data/system-params.json');
describe('Validator Hash checks', () => {
    it('CDP Creator validator hash', () => {
        expect(CDPCreatorContract.validatorHash(systemParams.cdpCreatorParams)).toBe(systemParams.validatorHashes.cdpCreatorHash);
    });
    it('CDP validator hash', () => {
        expect(CDPContract.validatorHash(systemParams.cdpParams)).toBe(systemParams.validatorHashes.cdpHash);
    });
    it('Collector validator hash', () => {
        expect(CollectorContract.validatorHash(systemParams.collectorParams)).toBe(systemParams.validatorHashes.collectorHash);
    });
})