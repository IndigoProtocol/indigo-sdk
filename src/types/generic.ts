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


export const VerificationKeyHashSchema = Data.Bytes({
  minLength: 28,
  maxLength: 28,
});

export const CredentialSchema = Data.Enum([
  Data.Object({
    PublicKeyCredential: Data.Tuple([VerificationKeyHashSchema]),
  }),
  Data.Object({
    ScriptCredential: Data.Tuple([
      Data.Bytes({ minLength: 28, maxLength: 28 }),
    ]),
  }),
]);
export type Credential = Data.Static<typeof CredentialSchema>;
export const Credential = CredentialSchema as unknown as Credential;

export const AddressSchema = Data.Object({
  paymentCredential: CredentialSchema,
  stakeCredential: Data.Nullable(
    Data.Enum([
      Data.Object({ Inline: Data.Tuple([CredentialSchema]) }),
      Data.Object({
        Pointer: Data.Tuple([
          Data.Object({
            slotNumber: Data.Integer(),
            transactionIndex: Data.Integer(),
            certificateIndex: Data.Integer(),
          }),
        ]),
      }),
    ])
  ),
});
export type Address = Data.Static<typeof AddressSchema>;
export const Address = AddressSchema as unknown as Address;

export interface CurrencySymbol {
  unCurrencySymbol: string;
}

export interface TokenName {
  unTokenName: string;
}
