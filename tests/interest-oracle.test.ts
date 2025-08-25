import { beforeEach, test } from 'vitest';
import { LucidContext, runAndAwaitTx } from './test-helpers';
import { credentialToAddress, fromText, Lucid } from '@lucid-evolution/lucid';
import { Emulator } from '@lucid-evolution/lucid';
import { generateEmulatorAccount } from '@lucid-evolution/lucid';
import { StakingContract } from '../src/contracts/staking';
import { init } from './endpoints/initialize';
import { addrDetails } from '../src/helpers/lucid-utils';
import { findStakingPosition } from './queries/staking-queries';
import { InterestOracleContract } from '../src';

beforeEach<LucidContext>(async (context: LucidContext) => {
  context.users = {
    user: generateEmulatorAccount({
      lovelace: BigInt(100_000_000_000_000),
    }),
  };

  context.emulator = new Emulator([context.users.user]);

  context.lucid = await Lucid(context.emulator, 'Custom');
});

test<LucidContext>('Interest Oracle - Launch', async ({
  lucid,
  users,
}: LucidContext) => {
  lucid.selectWallet.fromSeed(users.user.seedPhrase);

  const [pkh, _skh] = await addrDetails(lucid);

  const [tx, assetClass] = await InterestOracleContract.startInterestOracle(
        0n,
        0n,
        0n,
        {
            biasTime: 120_000n,
            owner: pkh.hash,
        },
        lucid
    );

  await runAndAwaitTx(lucid, tx);
});
