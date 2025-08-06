import { Assets, fromText, toUnit } from '@lucid-evolution/lucid';
import { AssetClass } from '../types/generic';

export function mkLovelacesOf(amount: bigint): Assets {
  return { lovelace: amount };
}

export function mkAssetsOf(assetClass: AssetClass, amount: bigint): Assets {
  return {
    [toUnit(assetClass.currencySymbol, fromText(assetClass.tokenName))]: amount,
  };
}
