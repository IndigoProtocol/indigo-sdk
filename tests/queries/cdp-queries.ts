import {
  Credential,
  fromText,
  LucidEvolution,
  ScriptHash,
  UTxO,
} from '@lucid-evolution/lucid';
import {
  AssetClass,
  CDPContent,
  createScriptAddress,
  fromSystemParamsAsset,
  getRandomElement,
  IAssetOutput,
  matchSingle,
  parseCdpDatum,
  SystemParams,
} from '../../src';
import { assetClassToUnit } from '../../src/utils/value-helpers';
import { option as O, array as A, function as F } from 'fp-ts';
import { findRandomCollector } from './collector-queries';
import { findGov } from './governance-queries';
import { findIAsset } from './iasset-queries';
import { findInterestOracle } from './interest-oracle-queries';
import { findPriceOracle } from './price-oracle-queries';
import { findStabilityPool } from './stability-pool-queries';
import { findRandomTreasuryUtxo } from './treasury-queries';
import { match, P } from 'ts-pattern';

export async function findAllActiveCdps(
  lucid: LucidEvolution,
  sysParams: SystemParams,
  assetAscii: string,
  stakeCred?: Credential,
): Promise<{ utxo: UTxO; datum: CDPContent }[]> {
  const cdpUtxos = await lucid.utxosAtWithUnit(
    createScriptAddress(
      lucid.config().network!,
      sysParams.validatorHashes.cdpHash,
      stakeCred,
    ),
    assetClassToUnit(fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken)),
  );

  return F.pipe(
    cdpUtxos.map((utxo) =>
      F.pipe(
        O.fromNullable(utxo.datum),
        O.flatMap(parseCdpDatum),
        O.flatMap((datum) => {
          if (datum.iasset === fromText(assetAscii) && datum.cdpOwner) {
            return O.some({ utxo, datum: datum });
          } else {
            return O.none;
          }
        }),
      ),
    ),
    A.compact,
  );
}

export async function findCdp(
  lucid: LucidEvolution,
  cdpScriptHash: ScriptHash,
  cdpNft: AssetClass,
  ownerPkh: string,
  stakeCred?: Credential,
): Promise<{ utxo: UTxO; datum: CDPContent }> {
  const cdpUtxos = await lucid.utxosAtWithUnit(
    createScriptAddress(lucid.config().network!, cdpScriptHash, stakeCred),
    assetClassToUnit(cdpNft),
  );

  return matchSingle(
    F.pipe(
      cdpUtxos.map((utxo) =>
        F.pipe(
          O.fromNullable(utxo.datum),
          O.flatMap(parseCdpDatum),
          O.flatMap((datum) => {
            if (datum.cdpOwner === ownerPkh) {
              return O.some({ utxo, datum: datum });
            } else {
              return O.none;
            }
          }),
        ),
      ),
      A.compact,
    ),
    (res) => new Error('Expected a single CDP UTXO.: ' + JSON.stringify(res)),
  );
}

export async function findFrozenCDPs(
  lucid: LucidEvolution,
  cdpScriptHash: ScriptHash,
  cdpNft: AssetClass,
  assetAscii: string,
): Promise<{ utxo: UTxO; datum: CDPContent }[]> {
  const cdpUtxos = await lucid.utxosAtWithUnit(
    createScriptAddress(lucid.config().network!, cdpScriptHash),
    assetClassToUnit(cdpNft),
  );

  return F.pipe(
    cdpUtxos.map((utxo) =>
      F.pipe(
        O.fromNullable(utxo.datum),
        O.flatMap(parseCdpDatum),
        O.flatMap((datum) => {
          if (datum.cdpOwner == null && datum.iasset === fromText(assetAscii)) {
            return O.some({ utxo, datum: datum });
          } else {
            return O.none;
          }
        }),
      ),
    ),
    A.compact,
  );
}

export async function findAllCdpCreators(
  lucid: LucidEvolution,
  cdpCreatorScriptHash: string,
  cdpCreatorNft: AssetClass,
): Promise<UTxO[]> {
  return lucid.utxosAtWithUnit(
    createScriptAddress(lucid.config().network!, cdpCreatorScriptHash),
    assetClassToUnit(cdpCreatorNft),
  );
}

export async function findRandomCdpCreator(
  lucid: LucidEvolution,
  cdpCreatorScriptHash: string,
  cdpCreatorNft: AssetClass,
): Promise<UTxO> {
  const cdpCreatorUtxos = await findAllCdpCreators(
    lucid,
    cdpCreatorScriptHash,
    cdpCreatorNft,
  );

  return F.pipe(
    O.fromNullable(getRandomElement(cdpCreatorUtxos)),
    O.match(() => {
      throw new Error('Expected some cdp creator UTXOs.');
    }, F.identity),
  );
}

export async function findAllNecessaryOrefs(
  lucid: LucidEvolution,
  sysParams: SystemParams,
  // ASCII encoded
  asset: string,
): Promise<{
  stabilityPoolUtxo: UTxO;
  iasset: IAssetOutput;
  cdpCreatorUtxo: UTxO;
  priceOracleUtxo: UTxO;
  interestOracleUtxo: UTxO;
  collectorUtxo: UTxO;
  govUtxo: UTxO;
  treasuryUtxo: UTxO;
}> {
  const iasset = await findIAsset(
    lucid,
    sysParams.validatorHashes.cdpHash,
    fromSystemParamsAsset(sysParams.cdpParams.iAssetAuthToken),
    asset,
  );

  const stabilityPool = await findStabilityPool(
    lucid,
    sysParams.validatorHashes.stabilityPoolHash,
    fromSystemParamsAsset(sysParams.stabilityPoolParams.stabilityPoolToken),
    asset,
  );

  return {
    stabilityPoolUtxo: stabilityPool,
    iasset,
    cdpCreatorUtxo: await findRandomCdpCreator(
      lucid,
      sysParams.validatorHashes.cdpCreatorHash,
      fromSystemParamsAsset(sysParams.cdpCreatorParams.cdpCreatorNft),
    ),
    priceOracleUtxo: await findPriceOracle(
      lucid,
      match(iasset.datum.price)
        .with({ Oracle: { content: P.select() } }, (oracleNft) => oracleNft)
        .otherwise(() => {
          throw new Error('Expected active oracle');
        }),
    ),
    interestOracleUtxo: await findInterestOracle(
      lucid,
      iasset.datum.interestOracleNft,
    ),
    collectorUtxo: await findRandomCollector(
      lucid,
      sysParams.validatorHashes.collectorHash,
    ),
    govUtxo: (
      await findGov(
        lucid,
        sysParams.validatorHashes.govHash,
        fromSystemParamsAsset(sysParams.govParams.govNFT),
      )
    ).utxo,
    treasuryUtxo: await findRandomTreasuryUtxo(
      lucid,
      sysParams.validatorHashes.treasuryHash,
    ),
  };
}
