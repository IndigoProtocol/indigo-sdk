import { beforeEach, test, afterEach } from 'vitest';
import { LucidContext, runAndAwaitTx } from './test-helpers';
import { EmulatorAccount, fromText, Lucid } from '@lucid-evolution/lucid';
import { Emulator } from '@lucid-evolution/lucid';
import { generateEmulatorAccount } from '@lucid-evolution/lucid';
import { init } from './endpoints/initialize';
import { addrDetails, CDPContract, StabilityPoolContract } from '../src';
import {
  findStabilityPool,
  findStabilityPoolAccount,
} from './queries/stability-pool-queries';
import { findIAsset } from './queries/iasset-queries';
import { findGov } from './queries/governance-queries';

let originalDateNow: () => number;

type MyContext = LucidContext<{
  admin: EmulatorAccount;
  user: EmulatorAccount;
}>;

beforeEach<MyContext>(async (context: MyContext) => {
  context.users = {
    admin: generateEmulatorAccount({
      lovelace: BigInt(100_000_000_000_000),
    }),
    user: generateEmulatorAccount({
      lovelace: BigInt(100_000_000_000_000),
    }),
  };

  context.emulator = new Emulator([context.users.admin, context.users.user]);

  context.lucid = await Lucid(context.emulator, 'Custom');

  originalDateNow = Date.now;
  Date.now = () => context.emulator.now();
});

afterEach(() => {
  Date.now = originalDateNow;
});

test<MyContext>('Stability Pool - Create Account', async ({
  lucid,
  users,
  emulator,
}: MyContext) => {
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);
  const systemParams = await init(lucid);
  lucid.selectWallet.fromSeed(users.user.seedPhrase);
  const [pkh, _] = await addrDetails(lucid);

  await runAndAwaitTx(
    lucid,
    CDPContract.openPosition(
      'iUSD',
      1_000_000_000n,
      20n,
      systemParams,
      lucid,
      emulator.slot,
    ),
  );

  await runAndAwaitTx(
    lucid,
    StabilityPoolContract.createAccount('iUSD', 10n, systemParams, lucid),
  );

  const stabilityPoolUtxo = await findStabilityPool(
    lucid,
    systemParams.validatorHashes.stabilityPoolHash,
    {
      currencySymbol:
        systemParams.stabilityPoolParams.stabilityPoolToken[0].unCurrencySymbol,
      tokenName: fromText(
        systemParams.stabilityPoolParams.stabilityPoolToken[1].unTokenName,
      ),
    },
    'iUSD',
  );

  const accountUtxo = await findStabilityPoolAccount(
    lucid,
    systemParams.validatorHashes.stabilityPoolHash,
    pkh.hash,
    'iUSD',
  );

  const assetUtxo = await findIAsset(
    lucid,
    systemParams.validatorHashes.cdpHash,
    {
      currencySymbol:
        systemParams.cdpParams.iAssetAuthToken[0].unCurrencySymbol,
      tokenName: fromText(
        systemParams.cdpParams.iAssetAuthToken[1].unTokenName,
      ),
    },
    'iUSD',
  );

  const govUtxo = await findGov(lucid, systemParams.validatorHashes.govHash, {
    currencySymbol: systemParams.govParams.govNFT[0].unCurrencySymbol,
    tokenName: fromText(systemParams.govParams.govNFT[1].unTokenName),
  });

  lucid.selectWallet.fromSeed(users.admin.seedPhrase);

  await runAndAwaitTx(
    lucid,
    StabilityPoolContract.processRequest(
      'iUSD',
      stabilityPoolUtxo,
      accountUtxo,
      govUtxo.utxo,
      assetUtxo.utxo,
      undefined,
      systemParams,
      lucid,
    ),
  );
});

test<MyContext>('Stability Pool - Adjust Account', async ({
  lucid,
  users,
  emulator,
}: MyContext) => {
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);
  const systemParams = await init(lucid);
  lucid.selectWallet.fromSeed(users.user.seedPhrase);
  const [pkh, _] = await addrDetails(lucid);

  await runAndAwaitTx(
    lucid,
    CDPContract.openPosition(
      'iUSD',
      1_000_000_000n,
      20n,
      systemParams,
      lucid,
      emulator.slot,
    ),
  );

  await runAndAwaitTx(
    lucid,
    StabilityPoolContract.createAccount('iUSD', 10n, systemParams, lucid),
  );

  lucid.selectWallet.fromSeed(users.admin.seedPhrase);

  let stabilityPoolUtxo = await findStabilityPool(
    lucid,
    systemParams.validatorHashes.stabilityPoolHash,
    {
      currencySymbol:
        systemParams.stabilityPoolParams.stabilityPoolToken[0].unCurrencySymbol,
      tokenName: fromText(
        systemParams.stabilityPoolParams.stabilityPoolToken[1].unTokenName,
      ),
    },
    'iUSD',
  );

  let accountUtxo = await findStabilityPoolAccount(
    lucid,
    systemParams.validatorHashes.stabilityPoolHash,
    pkh.hash,
    'iUSD',
  );

  const assetUtxo = await findIAsset(
    lucid,
    systemParams.validatorHashes.cdpHash,
    {
      currencySymbol:
        systemParams.cdpParams.iAssetAuthToken[0].unCurrencySymbol,
      tokenName: fromText(
        systemParams.cdpParams.iAssetAuthToken[1].unTokenName,
      ),
    },
    'iUSD',
  );

  const govUtxo = await findGov(lucid, systemParams.validatorHashes.govHash, {
    currencySymbol: systemParams.govParams.govNFT[0].unCurrencySymbol,
    tokenName: fromText(systemParams.govParams.govNFT[1].unTokenName),
  });

  await runAndAwaitTx(
    lucid,
    StabilityPoolContract.processRequest(
      'iUSD',
      stabilityPoolUtxo,
      accountUtxo,
      govUtxo.utxo,
      assetUtxo.utxo,
      undefined,
      systemParams,
      lucid,
    ),
  );

  lucid.selectWallet.fromSeed(users.user.seedPhrase);

  stabilityPoolUtxo = await findStabilityPool(
    lucid,
    systemParams.validatorHashes.stabilityPoolHash,
    {
      currencySymbol:
        systemParams.stabilityPoolParams.stabilityPoolToken[0].unCurrencySymbol,
      tokenName: fromText(
        systemParams.stabilityPoolParams.stabilityPoolToken[1].unTokenName,
      ),
    },
    'iUSD',
  );

  accountUtxo = await findStabilityPoolAccount(
    lucid,
    systemParams.validatorHashes.stabilityPoolHash,
    pkh.hash,
    'iUSD',
  );

  await runAndAwaitTx(
    lucid,
    StabilityPoolContract.adjustAccount(
      'iUSD',
      10n,
      accountUtxo,
      systemParams,
      lucid,
    ),
  );
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);

  accountUtxo = await findStabilityPoolAccount(
    lucid,
    systemParams.validatorHashes.stabilityPoolHash,
    pkh.hash,
    'iUSD',
  );

  await runAndAwaitTx(
    lucid,
    StabilityPoolContract.processRequest(
      'iUSD',
      stabilityPoolUtxo,
      accountUtxo,
      govUtxo.utxo,
      assetUtxo.utxo,
      undefined,
      systemParams,
      lucid,
    ),
  );
});

test<MyContext>('Stability Pool - Close Account', async ({
  lucid,
  users,
  emulator,
}: MyContext) => {
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);
  const systemParams = await init(lucid, emulator.now());
  lucid.selectWallet.fromSeed(users.user.seedPhrase);
  const [pkh, _] = await addrDetails(lucid);

  await runAndAwaitTx(
    lucid,
    CDPContract.openPosition(
      'iUSD',
      1_000_000_000n,
      20n,
      systemParams,
      lucid,
      emulator.slot,
    ),
  );

  await runAndAwaitTx(
    lucid,
    StabilityPoolContract.createAccount('iUSD', 10n, systemParams, lucid),
  );

  lucid.selectWallet.fromSeed(users.admin.seedPhrase);

  let stabilityPoolUtxo = await findStabilityPool(
    lucid,
    systemParams.validatorHashes.stabilityPoolHash,
    {
      currencySymbol:
        systemParams.stabilityPoolParams.stabilityPoolToken[0].unCurrencySymbol,
      tokenName: fromText(
        systemParams.stabilityPoolParams.stabilityPoolToken[1].unTokenName,
      ),
    },
    'iUSD',
  );

  let accountUtxo = await findStabilityPoolAccount(
    lucid,
    systemParams.validatorHashes.stabilityPoolHash,
    pkh.hash,
    'iUSD',
  );

  const assetUtxo = await findIAsset(
    lucid,
    systemParams.validatorHashes.cdpHash,
    {
      currencySymbol:
        systemParams.cdpParams.iAssetAuthToken[0].unCurrencySymbol,
      tokenName: fromText(
        systemParams.cdpParams.iAssetAuthToken[1].unTokenName,
      ),
    },
    'iUSD',
  );

  const govUtxo = await findGov(lucid, systemParams.validatorHashes.govHash, {
    currencySymbol: systemParams.govParams.govNFT[0].unCurrencySymbol,
    tokenName: fromText(systemParams.govParams.govNFT[1].unTokenName),
  });

  await runAndAwaitTx(
    lucid,
    StabilityPoolContract.processRequest(
      'iUSD',
      stabilityPoolUtxo,
      accountUtxo,
      govUtxo.utxo,
      assetUtxo.utxo,
      undefined,
      systemParams,
      lucid,
    ),
  );

  lucid.selectWallet.fromSeed(users.user.seedPhrase);

  stabilityPoolUtxo = await findStabilityPool(
    lucid,
    systemParams.validatorHashes.stabilityPoolHash,
    {
      currencySymbol:
        systemParams.stabilityPoolParams.stabilityPoolToken[0].unCurrencySymbol,
      tokenName: fromText(
        systemParams.stabilityPoolParams.stabilityPoolToken[1].unTokenName,
      ),
    },
    'iUSD',
  );

  accountUtxo = await findStabilityPoolAccount(
    lucid,
    systemParams.validatorHashes.stabilityPoolHash,
    pkh.hash,
    'iUSD',
  );

  await runAndAwaitTx(
    lucid,
    StabilityPoolContract.closeAccount(accountUtxo, systemParams, lucid),
  );
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);

  accountUtxo = await findStabilityPoolAccount(
    lucid,
    systemParams.validatorHashes.stabilityPoolHash,
    pkh.hash,
    'iUSD',
  );

  await runAndAwaitTx(
    lucid,
    StabilityPoolContract.processRequest(
      'iUSD',
      stabilityPoolUtxo,
      accountUtxo,
      govUtxo.utxo,
      assetUtxo.utxo,
      undefined,
      systemParams,
      lucid,
    ),
  );
});
