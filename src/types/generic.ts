import { Data } from "@lucid-evolution/lucid";

// Generic types for contracts.

// Output reference
export const OutputReferenceSchema = Data.Object({
  txHash: Data.Bytes({ minLength: 32, maxLength: 32 }),
  outputIndex: Data.Integer(),
});

export type OutputReference = Data.Static<typeof OutputReferenceSchema>;
export const OutputReference =
  OutputReferenceSchema as unknown as OutputReference;

// Verification key hash
export const VerificationKeyHashSchema = Data.Bytes({
  minLength: 28,
  maxLength: 28,
});

// Credential
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
export type CredentialD = Data.Static<typeof CredentialSchema>;
export const CredentialD = CredentialSchema as unknown as CredentialD;

// Address
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
export type AddressD = Data.Static<typeof AddressSchema>;
export const AddressD = AddressSchema as unknown as AddressD;

// Asset class
export const AssetClassSchema = Data.Object({
  policy_id: Data.Bytes({ minLength: 28, maxLength: 28 }),
  asset_name: Data.Bytes(),
});

export type AssetClass = Data.Static<typeof AssetClassSchema>;
export const AssetClass = AssetClassSchema as unknown as AssetClass;

// On chain decimal
export const OnChainDecimalSchema = Data.Object({
  value: Data.Integer(),
});

export type OnChainDecimal = Data.Static<typeof OnChainDecimalSchema>;
export const OnChainDecimal =
  OnChainDecimalSchema as unknown as OnChainDecimal;
