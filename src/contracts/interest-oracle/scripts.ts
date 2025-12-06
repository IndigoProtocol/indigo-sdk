import { applyParamsToScript } from '@lucid-evolution/lucid';
import { SpendingValidator } from '@lucid-evolution/lucid';
import {
  castInterestOracleParams,
  InterestOracleParams,
} from '../interest-oracle/types';
import { _interestOracleValidator } from '../../validators/interest-oracle-validator';

export function mkInterestOracleValidator(
  params: InterestOracleParams,
): SpendingValidator {
  return {
    type: 'PlutusV3',
    script: applyParamsToScript(_interestOracleValidator.cborHex, [
      castInterestOracleParams(params),
    ]),
  };
}
