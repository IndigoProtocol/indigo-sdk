import { Assets, toUnit, Unit } from '@lucid-evolution/lucid';
import { AssetClass } from '../types/generic';

export function mkLovelacesOf(amount: bigint): Assets {
  return { lovelace: amount };
}

export function assetClassToUnit(ac: AssetClass): Unit {
  return toUnit(ac.currencySymbol, ac.tokenName);
}

export function mkAssetsOf(assetClass: AssetClass, amount: bigint): Assets {
  return {
    [assetClassToUnit(assetClass)]: amount,
  };
}
