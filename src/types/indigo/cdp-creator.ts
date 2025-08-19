import { Data, Datum } from '@lucid-evolution/lucid';
import { AssetClassSchema } from '../generic';

const CDPCreatorParamsSchema = Data.Object({
  cdpCreatorNft: AssetClassSchema,
  cdpAssetCs: Data.Bytes(),
  cdpAuthTk: AssetClassSchema,
  iAssetAuthTk: AssetClassSchema,
  versionRecordToken: AssetClassSchema,
  cdpScriptHash: Data.Bytes(),
  collectorValHash: Data.Bytes(),
  minCollateralInLovelace: Data.Integer(),
  biasTime: Data.Integer(),
});

export type CDPCreatorParams = Data.Static<typeof CDPCreatorParamsSchema>;
export const CDPCreatorParams = CDPCreatorParamsSchema as unknown as CDPCreatorParams;

export function castCDPCreatorParams(params: CDPCreatorParams): Data {
  return Data.castTo(params, CDPCreatorParams);
}

const CDPCreatorRedeemerSchema = Data.Enum([
  Data.Object({ CreateCDP: Data.Object({
    cdpOwner: Data.Bytes(),
    minted: Data.Integer(),
    collateral: Data.Integer(),
    currentTime: Data.Integer(),
  })}),
  Data.Object({ UpgradeCreatorVersion: Data.Object({})}),
]);

export type CDPCreatorRedeemer = Data.Static<typeof CDPCreatorRedeemerSchema>;
export const CDPCreatorRedeemer = CDPCreatorRedeemerSchema as unknown as CDPCreatorRedeemer;

export function castCDPCreatorRedeemer(params: CDPCreatorRedeemer): Data {
  return Data.castTo(params, CDPCreatorRedeemer);
}

export function serialiseCDPCreatorDatum(): Datum {
  return Data.void();
}
