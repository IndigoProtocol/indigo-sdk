import { beforeEach, test } from 'vitest';
import { LucidContext, runAndAwaitTx } from './test-helpers';
import { fromText, Lucid } from '@lucid-evolution/lucid';
import { Emulator } from '@lucid-evolution/lucid';
import { generateEmulatorAccount } from '@lucid-evolution/lucid';
import { StakingContract } from '../src/contracts/staking';
import { init } from './endpoints/initialize';
import { addrDetails } from '../src/helpers/lucid-utils';
import { findStakingPosition } from './queries/staking-queries';

beforeEach<LucidContext>(async (context: LucidContext) => {
  context.users = {
    admin: generateEmulatorAccount({
      lovelace: BigInt(100_000_000_000_000),
    }),
  };

  context.emulator = new Emulator([context.users.admin]);

  context.lucid = await Lucid(context.emulator, 'Custom');
});

test<LucidContext>('Staking - Create Position', async ({
  lucid,
  users,
}: LucidContext) => {
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);
  const systemParams = await init(lucid);

  await runAndAwaitTx(
    lucid,
    StakingContract.openPosition(1_000_000n, systemParams, lucid),
  );
});

test<LucidContext>('Staking - Adjust Position', async ({
  lucid,
  users,
}: LucidContext) => {
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);
  const systemParams = await init(lucid);

  await runAndAwaitTx(
    lucid,
    StakingContract.openPosition(1_000_000n, systemParams, lucid),
  );

  const [pkh, _] = await addrDetails(lucid);
  const myStakingPosition = await findStakingPosition(
    lucid,
    lucid.config().network,
    systemParams.validatorHashes.stakingHash,
    {
      currencySymbol:
        systemParams.stakingParams.stakingToken[0].unCurrencySymbol,
      tokenName: fromText(
        systemParams.stakingParams.stakingToken[1].unTokenName,
      ),
    },
    pkh.hash,
  );

  await runAndAwaitTx(
    lucid,
    StakingContract.adjustPosition(
      myStakingPosition,
      1_000_000n,
      systemParams,
      lucid,
    ),
  );
});

test<LucidContext>('Staking - Close Position', async ({
  lucid,
  users,
}: LucidContext) => {
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);
  const systemParams = await init(lucid);

  await runAndAwaitTx(
    lucid,
    StakingContract.openPosition(1_000_000n, systemParams, lucid),
  );

  const [pkh, _] = await addrDetails(lucid);
  const myStakingPosition = await findStakingPosition(
    lucid,
    lucid.config().network,
    systemParams.validatorHashes.stakingHash,
    {
      currencySymbol:
        systemParams.stakingParams.stakingToken[0].unCurrencySymbol,
      tokenName: fromText(
        systemParams.stakingParams.stakingToken[1].unTokenName,
      ),
    },
    pkh.hash,
  );

  await runAndAwaitTx(
    lucid,
    StakingContract.closePosition(myStakingPosition, systemParams, lucid),
  );
});
