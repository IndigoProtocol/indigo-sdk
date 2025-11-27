import { CodecOptions } from '@evolution-sdk/evolution/core/CBOR';

/**
 * This is related to our on-chain codebase for aiken v1.0.26-alpha
 */
export const DEFAULT_SCHEMA_OPTIONS = {
  mode: 'custom',
  useIndefiniteArrays: true,
  // This is important to match aiken's Map encoding.
  useIndefiniteMaps: false,
  useDefiniteForEmpty: true,
  sortMapKeys: false,
  useMinimalEncoding: true,
  mapsAsObjects: false,
  encodeMapAsPairs: false,
} as const satisfies CodecOptions;
