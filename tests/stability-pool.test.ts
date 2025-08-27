import { beforeEach, test } from 'vitest';
import { LucidContext, runAndAwaitTx } from './test-helpers';
import { Lucid } from '@lucid-evolution/lucid';
import { Emulator } from '@lucid-evolution/lucid';
import { generateEmulatorAccount } from '@lucid-evolution/lucid';
import { init } from './endpoints/initialize';
import { CDPContract, StabilityPoolContract } from '../src';

beforeEach<LucidContext>(async (context: LucidContext) => {
  context.users = {
    admin: generateEmulatorAccount({
      lovelace: BigInt(100_000_000_000_000),
    }),
  };

  context.emulator = new Emulator([context.users.admin]);

  context.lucid = await Lucid(context.emulator, 'Custom');
});

test<LucidContext>('Stability Pool - Create Account', async ({
  lucid,
  users,
  emulator,
}: LucidContext) => {
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);
  const systemParams = await init(lucid, emulator.now());

  await runAndAwaitTx(
    lucid,
    CDPContract.openPosition(
      'iUSD',
      1_000_000_000n,
      20n,
      systemParams,
      lucid,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      emulator.now(),
    ),
  );

  await runAndAwaitTx(
    lucid,
    StabilityPoolContract.createAccount('iUSD', 10n, systemParams, lucid),
  );
});

test<LucidContext>('Stability Pool - Adjust Account', async ({
  lucid,
  users,
  emulator,
}: LucidContext) => {
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);
  const systemParams = await init(lucid, emulator.now());

  await runAndAwaitTx(
    lucid,
    CDPContract.openPosition(
      'iUSD',
      1_000_000_000n,
      20n,
      systemParams,
      lucid,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      emulator.now(),
    ),
  );

  await runAndAwaitTx(
    lucid,
    StabilityPoolContract.adjustAccount('iUSD', 10n, null, systemParams, lucid),
  );
});

test<LucidContext>('Stability Pool - Close Account', async ({
  lucid,
  users,
  emulator,
}: LucidContext) => {
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);
  const systemParams = await init(lucid, emulator.now());

  await runAndAwaitTx(
    lucid,
    CDPContract.openPosition(
      'iUSD',
      1_000_000_000n,
      20n,
      systemParams,
      lucid,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      emulator.now(),
    ),
  );

  await runAndAwaitTx(
    lucid,
    StabilityPoolContract.closeAccount('iUSD', null, systemParams, lucid),
  );
});
