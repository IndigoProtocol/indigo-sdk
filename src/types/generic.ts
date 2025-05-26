export interface OnChainDecimal {
  getOnChainInt: bigint;
}

export interface CurrencySymbol {
  unCurrencySymbol: string;
}

export interface TokenName {
  unTokenName: string;
}

export type AssetClass = [CurrencySymbol, TokenName];
