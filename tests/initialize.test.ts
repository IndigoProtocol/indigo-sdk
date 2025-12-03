import { beforeEach, test } from 'vitest';
import { LucidContext } from './test-helpers';
import { EmulatorAccount, Lucid } from '@lucid-evolution/lucid';
import { Emulator } from '@lucid-evolution/lucid';
import { generateEmulatorAccount } from '@lucid-evolution/lucid';
import { init } from './endpoints/initialize';
import { iusdInitialAssetCfg } from './mock/assets-mock';

type MyContext = LucidContext<{
  admin: EmulatorAccount;
}>;

beforeEach<MyContext>(async (context: MyContext) => {
  context.users = {
    admin: generateEmulatorAccount({
      lovelace: BigInt(100_000_000_000_000),
    }),
  };

  context.emulator = new Emulator([context.users.admin]);

  context.lucid = await Lucid(context.emulator, 'Custom');
});

test<MyContext>('Initialize Protocol - can initialize', async ({
  lucid,
  users,
}: MyContext) => {
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);

  await init(lucid, [iusdInitialAssetCfg]);
});
