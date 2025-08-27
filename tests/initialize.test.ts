import { beforeEach, test } from 'vitest';
import { LucidContext } from './test-helpers';
import { Lucid } from '@lucid-evolution/lucid';
import { Emulator } from '@lucid-evolution/lucid';
import { generateEmulatorAccount } from '@lucid-evolution/lucid';
import { init } from './endpoints/initialize';

beforeEach<LucidContext>(async (context: LucidContext) => {
  context.users = {
    admin: generateEmulatorAccount({
      lovelace: BigInt(100_000_000_000_000),
    }),
  };

  context.emulator = new Emulator([context.users.admin]);

  context.lucid = await Lucid(context.emulator, 'Custom');
});

test<LucidContext>('Initialize Protocol - can initialize', async ({
  lucid,
  users,
}: LucidContext) => {
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);

  await init(lucid);
});
