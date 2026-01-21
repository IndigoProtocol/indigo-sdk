import {
  Network,
  slotToUnixTime,
  unixTimeToSlot,
} from '@lucid-evolution/lucid';
import { ONE_SECOND } from '../../utils/time-helpers';

/**
 * Calculates the validity range based on the oracle expiration,
 * and caps the upper bound when necessary.
 */
export function oracleExpirationAwareValidity(
  currentSlot: number,
  biasTime: number,
  oracleExpiration: number,
  network: Network,
): {
  validFrom: number;
  validTo: number;
} {
  const validateFrom =
    slotToUnixTime(network, currentSlot - 1) -
    Math.min(120 * ONE_SECOND, biasTime);
  const defaultValidateTo = validateFrom + biasTime;
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
