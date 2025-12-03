import {
  applyParamsToScript,
  MintingPolicy,
  SpendingValidator,
} from '@lucid-evolution/lucid';
import {
  castVersionRecordTokenParams,
  VersionRecordTokenParams,
} from './types';
import { _versionRecordTokenPolicy } from '../../validators-export/version-record-policy';
import { _versionRegistryValidator } from '../../validators-export/version-registry-validator';

export function mkVersionRecordTokenPolicy(
  params: VersionRecordTokenParams,
): MintingPolicy {
  return {
    type: 'PlutusV2',
    script: applyParamsToScript(_versionRecordTokenPolicy.cborHex, [
      castVersionRecordTokenParams(params),
    ]),
  };
}

export const mkVersionRegistryValidator = (): SpendingValidator => {
  return {
    type: 'PlutusV2',
    script: _versionRegistryValidator.cborHex,
  };
};
