import { afterEach, beforeEach, test } from 'vitest';
import {
  LucidContext,
  runAndAwaitTx,
  runAndAwaitTxBuilder,
} from './test-helpers';
import { Lucid } from '@lucid-evolution/lucid';
import { Emulator } from '@lucid-evolution/lucid';
import { generateEmulatorAccount } from '@lucid-evolution/lucid';
import { addrDetails } from '../src/helpers/lucid-utils';
import { InterestOracleContract, InterestOracleParams } from '../src';
import { findInterestOracle } from './queries/interest-oracle-queries';

let originalDateNow: () => number;

beforeEach<LucidContext>(async (context: LucidContext) => {
  context.users = {
    user: generateEmulatorAccount({
      lovelace: BigInt(100_000_000_000_000),
    }),
  };

  context.emulator = new Emulator([context.users.user]);

  context.lucid = await Lucid(context.emulator, 'Custom');

  originalDateNow = Date.now;
  Date.now = () => context.emulator.now();
});

afterEach(() => {
  Date.now = originalDateNow;
});

test<LucidContext>('Interest Oracle - Start', async ({
  lucid,
  users,
}: LucidContext) => {
  lucid.selectWallet.fromSeed(users.user.seedPhrase);

  const [pkh, _] = await addrDetails(lucid);

  const [tx, _ac] = await InterestOracleContract.startInterestOracle(
    0n,
    0n,
    0n,
    {
      biasTime: 120_000n,
      owner: pkh.hash,
    },
    lucid,
  );

  await runAndAwaitTxBuilder(lucid, tx);
});

test<LucidContext>('Interest Oracle - Update', async ({
  lucid,
  users,
}: LucidContext) => {
  lucid.selectWallet.fromSeed(users.user.seedPhrase);

  const [pkh, _] = await addrDetails(lucid);
  const interestParams: InterestOracleParams = {
    biasTime: 120_000n,
    owner: pkh.hash,
  };

  const [tx, assetClass] = await InterestOracleContract.startInterestOracle(
    0n,
    0n,
    0n,
    interestParams,
    lucid,
  );

  await runAndAwaitTxBuilder(lucid, tx);

  const [utxo, _datum] = await findInterestOracle(lucid, assetClass);
  await runAndAwaitTx(
    lucid,
    InterestOracleContract.feedInterestOracle(
      interestParams,
      500_000n,
      lucid,
      undefined,
      utxo,
    ),
  );
});
