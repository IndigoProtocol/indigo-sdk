import { Data, Redeemer } from '@lucid-evolution/lucid';

const CollectorRedeemerSchema = Data.Enum([
  Data.Literal('Collect'),
  Data.Literal('DistributeToStakers'),
  Data.Literal('UpgradeVersion'),
]);
export type CollectorRedeemer = Data.Static<typeof CollectorRedeemerSchema>;
const CollectorRedeemer =
  CollectorRedeemerSchema as unknown as CollectorRedeemer;

export function serialiseCollectorRedeemer(
  redeemer: CollectorRedeemer,
): Redeemer {
  return Data.to<CollectorRedeemer>(redeemer, CollectorRedeemer);
}
