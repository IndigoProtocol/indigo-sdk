import { Data } from '@lucid-evolution/lucid';
import * as TypeBox from '@sinclair/typebox';

export function mkMaybeSchema<T extends TypeBox.TSchema>(
  item: T,
): TypeBox.TUnion<
  (
    | TypeBox.TLiteral<'Nothing'>
    | TypeBox.TObject<{ Some: TypeBox.TObject<{ value: T }> }>
  )[]
> {
  return Data.Enum([
    Data.Object({ Some: Data.Object({ value: item }, { hasConstr: false }) }),
    Data.Literal('Nothing'),
  ]);
}

export const AssetClassSchema = Data.Object({
  currencySymbol: Data.Bytes(),
  /** Use the HEX encoding */
  tokenName: Data.Bytes(),
});
export type AssetClass = Data.Static<typeof AssetClassSchema>;

export const OutputReferenceSchema = Data.Object({
  txHash: Data.Object({ hash: Data.Bytes({ minLength: 32, maxLength: 32 }) }),
  outputIndex: Data.Integer(),
});
export type OutputReference = Data.Static<typeof OutputReferenceSchema>;

export interface CurrencySymbol {
  unCurrencySymbol: string;
}

export interface TokenName {
  unTokenName: string;
}
