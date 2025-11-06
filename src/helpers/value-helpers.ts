import { Assets, toUnit, Unit } from '@lucid-evolution/lucid';
import { AssetClass } from '../types/generic';

export function mkLovelacesOf(amount: bigint): Assets {
  return { lovelace: amount };
}

export function lovelacesAmt(assets: Assets): bigint {
  return assets.lovelace ?? 0n;
}

export function assetClassToUnit(ac: AssetClass): Unit {
  return toUnit(ac.currencySymbol, ac.tokenName);
}

export function mkAssetsOf(assetClass: AssetClass, amount: bigint): Assets {
  return {
    [assetClassToUnit(assetClass)]: amount,
  };
}

export function assetClassValueOf(
  assets: Assets,
  assetClass: AssetClass,
): bigint {
  return assets[assetClassToUnit(assetClass)] ?? 0n;
}

export function negateAssets(assets: Assets): Assets {
  return Object.fromEntries(
    Object.entries(assets).map(([asset, amt]) => [asset, -amt]),
  );
}

export function isAssetsZero(assets: Assets): boolean {
  return Object.entries(assets).every(([_, amt]) => amt === 0n);
}
