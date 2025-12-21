import { beforeEach, test } from 'vitest';
import { openLrp, redeemLrpWithCdpOpen, SystemParams } from '../src';
import {
  addAssets,
  Emulator,
  EmulatorAccount,
  fromText,
  generateEmulatorAccount,
  Lucid,
  toText,
} from '@lucid-evolution/lucid';
import { findAllNecessaryOrefs } from './queries/cdp-queries';
import { LucidContext, runAndAwaitTx } from './test-helpers';
import { describe } from 'vitest';
import { mkLovelacesOf } from '../src/utils/value-helpers';
import { init } from './endpoints/initialize';
import { iusdInitialAssetCfg } from './mock/assets-mock';
import { findAllLrps } from './queries/lrp-queries';

type MyContext = LucidContext<{
  admin: EmulatorAccount;
  user: EmulatorAccount;
}>;

async function openLrps(
  context: MyContext,
  sysParams: SystemParams,
  iasset: string,
  amountsToSpend: bigint[],
): Promise<void> {
  for (const amt of amountsToSpend) {
    await runAndAwaitTx(
      context.lucid,
      openLrp(
        iasset,
        amt,
        { getOnChainInt: 1_000_000n },
        context.lucid,
        sysParams,
      ),
    );
  }
}

describe('LRP leverage', () => {
  beforeEach<MyContext>(async (context: MyContext) => {
    context.users = {
      admin: generateEmulatorAccount({
        lovelace: BigInt(100_000_000_000_000),
      }),
      user: generateEmulatorAccount(addAssets(mkLovelacesOf(150_000_000n))),
    };

    context.emulator = new Emulator([context.users.admin, context.users.user]);
    context.lucid = await Lucid(context.emulator, 'Custom');
  });

  test<MyContext>('Open CDP', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, __] = await init(context.lucid, [iusdInitialAssetCfg]);

    const iasset = fromText(iusdInitialAssetCfg.name);

    await openLrps(context, sysParams, iasset, [
      20_000_000n,
      25_000_000n,
      100_000_000n,
      150_000_000n,
      200_000_000n,
      100_000_000n,
      300_000_000n,
    ]);

    const allLrps = await findAllLrps(context.lucid, sysParams, iasset);

    const orefs = await findAllNecessaryOrefs(
      context.lucid,
      sysParams,
      toText(iasset),
    );

    await redeemLrpWithCdpOpen(
      1.5,
      1_000n,
      { getOnChainInt: 140_000_000n },
      orefs.priceOracleUtxo,
      orefs.iasset.utxo,
      orefs.cdpCreatorUtxo,
      orefs.interestOracleUtxo,
      orefs.collectorUtxo,
      sysParams,
      context.lucid,
      allLrps.map((lrps) => [lrps.utxo, lrps.datum]),
      context.emulator.slot,
    );
  });
});
