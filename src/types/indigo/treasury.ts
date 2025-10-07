import { Data, Datum, Redeemer } from '@lucid-evolution/lucid';
import { AssetClassSchema, StakeCredentialSchema } from '../generic';

export const TreasuryParamsSchema = Data.Object({
  upgradeToken: AssetClassSchema,
  versionRecordToken: AssetClassSchema,
  treasuryUtxosStakeCredential: Data.Nullable(StakeCredentialSchema),
});
export type TreasuryParams = Data.Static<typeof TreasuryParamsSchema>;
export const TreasuryParams = TreasuryParamsSchema as unknown as TreasuryParams;

const TreasuryRedeemerSchema = Data.Enum([
  Data.Literal('Withdraw'),
  Data.Literal('PrepareWithdraw'),
  Data.Literal('Split'),
  Data.Literal('Merge'),
  Data.Literal('CollectAda'),
  Data.Literal('UpgradeVersion'),
]);
export type TreasuryRedeemer = Data.Static<typeof TreasuryRedeemerSchema>;
const TreasuryRedeemer = TreasuryRedeemerSchema as unknown as TreasuryRedeemer;

export function serialiseTreasuryRedeemer(redeemer: TreasuryRedeemer): Redeemer {
  return Data.to<TreasuryRedeemer>(redeemer, TreasuryRedeemer);
}

export function serialiseTreasuryDatum(): Datum {
  return Data.void();
}

export function castTreasuryParams(params: TreasuryParams): Data {
  return Data.castTo(params, TreasuryParams);
}
