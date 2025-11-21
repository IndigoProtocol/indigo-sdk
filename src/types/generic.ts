import {
  credentialToAddress,
  Data,
  getAddressDetails,
  Credential,
  Network,
} from '@lucid-evolution/lucid';
import { match, P } from 'ts-pattern';
import { Core as EvoCore } from '@evolution-sdk/evolution';

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
export type CredentialD = Data.Static<typeof CredentialSchema>;
export const CredentialD = CredentialSchema as unknown as CredentialD;

export const StakeCredentialSchema = Data.Enum([
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
]);

export const AddressSchema = Data.Object({
  paymentCredential: CredentialSchema,
  stakeCredential: Data.Nullable(StakeCredentialSchema),
});
export type AddressD = Data.Static<typeof AddressSchema>;
export const AddressD = AddressSchema as unknown as AddressD;

export function addressToBech32(address: AddressD, network: Network): string {
  const matchCred = (cred: CredentialD) =>
    match(cred)
      .returnType<Credential>()
      .with({ PublicKeyCredential: [P.select()] }, (pkh) => {
        return { type: 'Key', hash: pkh };
      })
      .with({ ScriptCredential: [P.select()] }, (scriptCred) => {
        return { type: 'Script', hash: scriptCred };
      })
      .exhaustive();

  const stakeCred: Credential | undefined = match(address.stakeCredential)
    .returnType<Credential | undefined>()
    .with(P.nullish, () => undefined)
    .with({ Inline: [P.select()] }, (cred) => matchCred(cred))
    .otherwise(() => {
      throw new Error('Unexpected stake credential format.');
    });

  const cred: Credential = matchCred(address.paymentCredential);

  return credentialToAddress(network, cred, stakeCred);
}

export function addressFromBech32(address: string): AddressD {
  const details = getAddressDetails(address);

  const matchCred = (cred: Credential): CredentialD => {
    return match(cred)
      .returnType<CredentialD>()
      .with({ type: 'Key', hash: P.select() }, (pkh) => {
        return {
          PublicKeyCredential: [pkh],
        };
      })
      .with({ type: 'Script', hash: P.select() }, (scriptHash) => ({
        ScriptCredential: [scriptHash],
      }))
      .exhaustive();
  };

  return match(details)
    .returnType<AddressD>()
    .with(
      { paymentCredential: P.nullish },
      { type: P.not(P.union('Base', 'Enterprise')) },
      (_) => {
        throw new Error('Invalid address provided');
      },
    )
    .narrow()
    .otherwise((details) => ({
      paymentCredential: matchCred(details.paymentCredential),
      stakeCredential: details.stakeCredential
        ? {
            Inline: [matchCred(details.stakeCredential)],
          }
        : null,
    }));
}

export interface CurrencySymbol {
  unCurrencySymbol: string;
}

export interface TokenName {
  unTokenName: string;
}

export function cborToEvoData(d: string): EvoCore.Data.Data {
  return EvoCore.Data.fromCBORHex(d);
}

export function evoDataToCbor(d: EvoCore.Data.Data): string {
  return EvoCore.Data.toCBORHex(d);
}
