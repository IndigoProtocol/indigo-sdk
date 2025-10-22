import {
  addAssets,
  Emulator,
  EmulatorAccount,
  generateEmulatorAccount,
  Lucid,
} from '@lucid-evolution/lucid';
import { beforeEach, describe, test } from 'vitest';
import { LucidContext, runAndAwaitTx } from './test-helpers';
import { mkLovelacesOf } from '../src/helpers/value-helpers';
import { init } from './endpoints/initialize';
import { fromSystemParamsAsset, openCdp } from '../src';
import { findRandomCdpCreator } from './queries/cdp-queries';
import { findIAsset } from './queries/iasset-queries';
import { findPriceOracle } from './queries/price-oracle-queries';
import { match, P } from 'ts-pattern';
import { findInterestOracle } from './queries/interest-oracle-queries';
import { findRandomCollector } from './queries/collector-queries';

type MyContext = LucidContext<{
  admin: EmulatorAccount;
  user: EmulatorAccount;
}>;

describe('CDP', () => {
  beforeEach<MyContext>(async (context: MyContext) => {
    context.users = {
      admin: generateEmulatorAccount({
        lovelace: BigInt(100_000_000_000_000),
      }),
      user: generateEmulatorAccount(addAssets(mkLovelacesOf(100_000_000n))),
    };

    context.emulator = new Emulator([context.users.admin, context.users.user]);
    context.lucid = await Lucid(context.emulator, 'Custom');
  });

  test<MyContext>('Open CDP', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const sysParams = await init(context.lucid);

    const asset = 'iUSD';

    const iasset = await findIAsset(
      context.lucid,
      sysParams.validatorHashes.cdpHash,
      fromSystemParamsAsset(sysParams.cdpParams.iAssetAuthToken),
      asset,
    );

    await runAndAwaitTx(
      context.lucid,
      openCdp(
        10_000_000n,
        500_000n,
        sysParams,
        await findRandomCdpCreator(
          context.lucid,
          sysParams.validatorHashes.cdpCreatorHash,
          fromSystemParamsAsset(sysParams.cdpCreatorParams.cdpCreatorNft),
        ),
        iasset.utxo,
        await findPriceOracle(
          context.lucid,
          match(iasset.datum.price)
            .with({ Oracle: { content: P.select() } }, (oracleNft) => oracleNft)
            .otherwise(() => {
              throw new Error('Expected active oracle');
            }),
        ),
        await findInterestOracle(context.lucid, iasset.datum.interestOracleNft),
        await findRandomCollector(
          context.lucid,
          sysParams.validatorHashes.collectorHash,
        ),
        context.lucid,
        context.emulator.slot,
      ),
    );
  });
});
