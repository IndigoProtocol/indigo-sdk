import {
  Network,
  slotToUnixTime,
  unixTimeToSlot,
} from '@lucid-evolution/lucid';
import { ONE_SECOND } from './time-helpers';

/**
 * Calculates the validity range based on the oracle expiration,
 * and caps the upper bound when necessary.
 */
export function oracleExpirationAwareValidity(
  now: number,
  biasTime: number,
  oracleExpiration: number,
  network: Network,
): {
  validFrom: number;
  validTo: number;
} {
  const validateFrom = now - ONE_SECOND;
  const defaultValidateTo = now + biasTime - ONE_SECOND;
  /// Take the oracle expiration time - 1 slot which is the last acceptable non-expired valid_to time
  /// for the current oracle.
  const cappedValidateTo = slotToUnixTime(
    network,
    unixTimeToSlot(network, oracleExpiration) - 1,
  );
  const isOracleActuallyExpired = cappedValidateTo <= validateFrom;

  return {
    validFrom: validateFrom,
    validTo: isOracleActuallyExpired
      ? defaultValidateTo
      : Math.min(defaultValidateTo, cappedValidateTo),
  };
}
