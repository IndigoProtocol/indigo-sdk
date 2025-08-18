import { beforeEach, test, afterEach } from 'vitest';
import { LucidContext, runAndAwaitTx } from './test-helpers';
import { fromText, Lucid } from '@lucid-evolution/lucid';
import { Emulator } from '@lucid-evolution/lucid';
import { generateEmulatorAccount } from '@lucid-evolution/lucid';
import { init } from './endpoints/initialize';
import { addrDetails, CDPContract, StabilityPoolContract } from '../src';
import { findStabilityPool, findStabilityPoolAccount } from './queries/stability-pool-queries';
import { findIAsset } from './queries/iasset-queries';
import { findGov } from './queries/governance-queries';

let originalDateNow: () => number;

beforeEach<LucidContext>(async (context: LucidContext) => {
  context.users = {
    admin: generateEmulatorAccount({
      lovelace: BigInt(100_000_000_000_000),
    }),
  };

  context.emulator = new Emulator([context.users.admin]);

  context.lucid = await Lucid(context.emulator, 'Custom');

  originalDateNow = Date.now;
  Date.now = () => context.emulator.now();
});

afterEach(() => {
  Date.now = originalDateNow;
});

test<LucidContext>('Stability Pool - Create Account', async ({
  lucid,
  users,
  emulator,
}: LucidContext) => {
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);
  const systemParams = await init(lucid, emulator.now());
  const [pkh, _] = await addrDetails(lucid);

  await runAndAwaitTx(
    lucid,
    CDPContract.openPosition(
      'iUSD',
      1_000_000_000n,
      20n,
      systemParams,
      lucid
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
      currencySymbol: systemParams.stabilityPoolParams.stabilityPoolToken[0].unCurrencySymbol,
      tokenName: fromText(systemParams.stabilityPoolParams.stabilityPoolToken[1].unTokenName),
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
      currencySymbol: systemParams.cdpParams.iAssetAuthToken[0].unCurrencySymbol,
      tokenName: fromText(systemParams.cdpParams.iAssetAuthToken[1].unTokenName),
    },
    'iUSD',
  );

  // const govUtxo = await findGov(
  //   lucid,
  //   systemParams.validatorHashes.govHash,
  //   {
  //     currencySymbol: systemParams.govParams.govNFT[0].unCurrencySymbol,
  //     tokenName: fromText(systemParams.govParams.govNFT[1].unTokenName),
  //   }
  // );

  await runAndAwaitTx(
    lucid,
    StabilityPoolContract.processRequest(
      'iUSD',
      stabilityPoolUtxo,
      accountUtxo,
      assetUtxo, // TODO: Gov UTxO
      assetUtxo,
      undefined,
      systemParams,
      lucid,
    )
  );
});

// test<LucidContext>('Stability Pool - Adjust Account', async ({
//   lucid,
//   users,
//   emulator,
// }: LucidContext) => {
//   lucid.selectWallet.fromSeed(users.admin.seedPhrase);
//   const systemParams = await init(lucid, emulator.now());

//   await runAndAwaitTx(
//     lucid,
//     CDPContract.openPosition(
//       'iUSD',
//       1_000_000_000n,
//       20n,
//       systemParams,
//       lucid,
//       undefined,
//       undefined,
//       undefined,
//       undefined,
//       undefined,
//       emulator.now(),
//     ),
//   );

//   await runAndAwaitTx(
//     lucid,
//     StabilityPoolContract.adjustAccount('iUSD', 10n, null, systemParams, lucid),
//   );
// });

// test<LucidContext>('Stability Pool - Close Account', async ({
//   lucid,
//   users,
//   emulator,
// }: LucidContext) => {
//   lucid.selectWallet.fromSeed(users.admin.seedPhrase);
//   const systemParams = await init(lucid, emulator.now());

//   await runAndAwaitTx(
//     lucid,
//     CDPContract.openPosition(
//       'iUSD',
//       1_000_000_000n,
//       20n,
//       systemParams,
//       lucid,
//       undefined,
//       undefined,
//       undefined,
//       undefined,
//       undefined,
//       emulator.now(),
//     ),
//   );

//   await runAndAwaitTx(
//     lucid,
//     StabilityPoolContract.closeAccount('iUSD', null, systemParams, lucid),
//   );
// });
