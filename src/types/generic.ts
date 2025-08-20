import {
  credentialToAddress,
  Credential as LucidCredential,
  Data,
  LucidEvolution,
  getAddressDetails,
} from '@lucid-evolution/lucid';

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
    ]),
  ),
});
export type Address = Data.Static<typeof AddressSchema>;
export const Address = AddressSchema as unknown as Address;

export function addressToBech32(
  lucid: LucidEvolution,
  address: Address,
): string {
  const paymentCredential: LucidCredential =
    'PublicKeyCredential' in address.paymentCredential
      ? { type: 'Key', hash: address.paymentCredential.PublicKeyCredential[0] }
      : { type: 'Script', hash: address.paymentCredential.ScriptCredential[0] };
  const stakeCredential: LucidCredential | undefined =
    address.stakeCredential && 'Inline' in address.stakeCredential
      ? 'PublicKeyCredential' in address.stakeCredential.Inline[0]
        ? {
            type: 'Key',
            hash: address.stakeCredential.Inline[0].PublicKeyCredential[0],
          }
        : {
            type: 'Script',
            hash: address.stakeCredential.Inline[0].ScriptCredential[0],
          }
      : undefined;
  
  return credentialToAddress(
    lucid.config().network,
    paymentCredential,
    stakeCredential,
  );
}

export function addressFromBech32(
  address: string,
): Address {
  const details = getAddressDetails(address);
  return {
    paymentCredential: {
      PublicKeyCredential: [details.paymentCredential.hash],
    },
    stakeCredential: details.stakeCredential ? {Inline: [{PublicKeyCredential: [details.stakeCredential.hash]}]} : undefined,
  };
}

export interface CurrencySymbol {
  unCurrencySymbol: string;
}

export interface TokenName {
  unTokenName: string;
}
