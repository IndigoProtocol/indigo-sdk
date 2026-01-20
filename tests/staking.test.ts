import { beforeEach, expect, test } from 'vitest';
import { LucidContext, runAndAwaitTx } from './test-helpers';
import { EmulatorAccount, Lucid } from '@lucid-evolution/lucid';
import { Emulator } from '@lucid-evolution/lucid';
import { generateEmulatorAccount } from '@lucid-evolution/lucid';
import { init } from './endpoints/initialize';
import { addrDetails } from '../src/utils/lucid-utils';
import { findStakingPosition } from './queries/staking-queries';
import { iusdInitialAssetCfg } from './mock/assets-mock';
import {
  adjustStakingPosition,
  closeStakingPosition,
  distributeAda,
  openStakingPosition,
} from '../src/contracts/staking/transactions';
import { collectorFeeTx, fromSystemParamsAsset } from '../src';
import {
  findAllCollectors,
  findRandomCollector,
} from './queries/collector-queries';
import { findStakingManager } from '../src/contracts/staking/helpers';
import { getValueChangeAtAddressAfterAction } from './utils';
import { lovelacesAmt } from '@3rd-eye-labs/cardano-offchain-common';

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

test<MyContext>('Staking - Create Position', async ({
  lucid,
  users,
}: MyContext) => {
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);
  const [systemParams, _] = await init(lucid, [iusdInitialAssetCfg]);

  await runAndAwaitTx(
    lucid,
    openStakingPosition(1_000_000n, systemParams, lucid),
  );
});

test<MyContext>('Staking - Adjust Position', async ({
  lucid,
  users,
  emulator,
}: MyContext) => {
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);
  const [systemParams, _] = await init(lucid, [iusdInitialAssetCfg]);

  await runAndAwaitTx(
    lucid,
    openStakingPosition(1_000_000n, systemParams, lucid),
  );

  const [pkh, __] = await addrDetails(lucid);
  const myStakingPosition = await findStakingPosition(
    lucid,
    systemParams.validatorHashes.stakingHash,
    fromSystemParamsAsset(systemParams.stakingParams.stakingToken),
    pkh.hash,
  );

  await runAndAwaitTx(
    lucid,
    adjustStakingPosition(
      myStakingPosition.utxo,
      1_000_000n,
      systemParams,
      lucid,
      emulator.slot,
    ),
  );
});

test<MyContext>('Staking - Close Position', async ({
  lucid,
  users,
  emulator,
}: MyContext) => {
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);
  const [systemParams, _] = await init(lucid, [iusdInitialAssetCfg]);

  await runAndAwaitTx(
    lucid,
    openStakingPosition(1_000_000n, systemParams, lucid),
  );

  const [pkh, __] = await addrDetails(lucid);
  const myStakingPosition = await findStakingPosition(
    lucid,
    systemParams.validatorHashes.stakingHash,
    fromSystemParamsAsset(systemParams.stakingParams.stakingToken),
    pkh.hash,
  );

  await runAndAwaitTx(
    lucid,
    closeStakingPosition(
      myStakingPosition.utxo,
      systemParams,
      lucid,
      emulator.slot,
    ),
  );
});

test<MyContext>('Staking - Distribute ADA to Stakers', async ({
  lucid,
  users,
  emulator,
}: MyContext) => {
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);
  const [systemParams, _] = await init(lucid, [iusdInitialAssetCfg]);

  await runAndAwaitTx(
    lucid,
    openStakingPosition(1_000_000n, systemParams, lucid),
  );

  const collectorOref = await findRandomCollector(
    lucid,
    systemParams.validatorHashes.collectorHash,
  );
  const tx = lucid.newTx();
  await collectorFeeTx(100_000_000n, lucid, systemParams, tx, collectorOref);
  await runAndAwaitTx(lucid, Promise.resolve(tx));

  const collectorUtxo = (
    await findAllCollectors(lucid, systemParams.validatorHashes.collectorHash)
  ).find((utxo) => utxo.assets.lovelace > 100_000_000n);
  if (!collectorUtxo) {
    throw new Error('Expected a collector UTXO');
  }

  await runAndAwaitTx(
    lucid,
    distributeAda(
      (await findStakingManager(systemParams, lucid)).utxo,
      [collectorUtxo],
      systemParams,
      lucid,
    ),
  );

  const [pkh, __] = await addrDetails(lucid);
  const myStakingPosition = await findStakingPosition(
    lucid,
    systemParams.validatorHashes.stakingHash,
    fromSystemParamsAsset(systemParams.stakingParams.stakingToken),
    pkh.hash,
  );

  const [____, userValChange] = await getValueChangeAtAddressAfterAction(
    lucid,
    users.admin.address,
    () =>
      runAndAwaitTx(
        lucid,
        closeStakingPosition(
          myStakingPosition.utxo,
          systemParams,
          lucid,
          emulator.slot,
        ),
      ),
  );

  expect(lovelacesAmt(userValChange)).toBeGreaterThan(95_000_000n); // There is some loss due to tx fees.
});
