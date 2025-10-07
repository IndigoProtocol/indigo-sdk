import { beforeEach, expect, test } from 'vitest';
import { LucidContext, runAndAwaitTx } from './test-helpers';
import { Data, EmulatorAccount, fromText, Lucid } from '@lucid-evolution/lucid';
import { Emulator } from '@lucid-evolution/lucid';
import { generateEmulatorAccount } from '@lucid-evolution/lucid';
import { init } from './endpoints/initialize';
import { findTreasuryOutputs, mkTreasuryAddress, mkTreasuryParamsFromSP, SystemParams, treasuryMerge, treasurySplit } from '../src';

type MyContext = LucidContext<{
  admin: EmulatorAccount;
  user: EmulatorAccount;
}> & {
  systemParams: SystemParams;
};


const examplePolicyId =
  '00000000000000000000000000000000000000000000000000000000';
const exampleTokenName1 = fromText('example-token-1');
const exampleTokenName2 = fromText('example-token-2');

beforeEach<MyContext>(async (context: MyContext) => {
  context.users = {
    admin: generateEmulatorAccount({
      lovelace: BigInt(100_000_000_000_000),
      [examplePolicyId + exampleTokenName1]: 3n,
      [examplePolicyId + exampleTokenName2]: 1n,
    }),
    user: generateEmulatorAccount({
      lovelace: BigInt(100_000_000_000_000),
    }),
  };

  context.emulator = new Emulator([context.users.admin, context.users.user]);

  context.lucid = await Lucid(context.emulator, 'Custom');
  context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

  context.systemParams = await init(context.lucid);
});

async function testTreasuryMerge<T extends MyContext>(
  context: T,
  treasuryOutputs: Record<string, bigint>[]
) {
  const { lucid, users, systemParams } = context;
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);

  const params = mkTreasuryParamsFromSP(systemParams.treasuryParams);
  const treasuryAddress = mkTreasuryAddress(params, lucid.config().network!);

  // Create treasury outputs
  await runAndAwaitTx(
    lucid,
    Promise.resolve(
      treasuryOutputs.reduce(
        (tx, output) => tx.pay.ToContract(
          treasuryAddress,
          { kind: 'inline', value: Data.void() },
          output
        ),
        lucid.newTx()
      )
    )
  );

  const treasuryUtxos = await findTreasuryOutputs(lucid, params);

  lucid.selectWallet.fromSeed(users.user.seedPhrase);

  await runAndAwaitTx(
    lucid,
    treasuryMerge(
      treasuryUtxos,
      lucid,
      {
        txHash: systemParams.scriptReferences.treasuryValidatorRef.input.transactionId,
        outputIndex: Number(systemParams.scriptReferences.treasuryValidatorRef.input.index),
      },
      params
    )
  );
}

test<MyContext>('Treasury - Merge (3 lovelace UTxOs)', async (context: MyContext) => {
  await testTreasuryMerge(context, [
    { lovelace: 50_000_000n },
    { lovelace: 50_000_000n },
    { lovelace: 50_000_000n }
  ]);
});

test<MyContext>('Treasury - Merge (3 asset UTxOs)', async (context: MyContext) => {
  await testTreasuryMerge(context, [
    { lovelace: 50_000_000n, [examplePolicyId + exampleTokenName1]: 1n },
    { lovelace: 50_000_000n, [examplePolicyId + exampleTokenName1]: 1n },
    { lovelace: 50_000_000n, [examplePolicyId + exampleTokenName1]: 1n }
  ]);
});

test<MyContext>('Treasury - Merge (fail, 3 asset UTxOs)', async (context: MyContext) => {
  await expect(testTreasuryMerge(context, [
    { lovelace: 50_000_000n, [examplePolicyId + exampleTokenName1]: 1n },
    { lovelace: 50_000_000n, [examplePolicyId + exampleTokenName1]: 1n },
    { lovelace: 50_000_000n, [examplePolicyId + exampleTokenName2]: 1n }
  ])).rejects.toThrowError()
});


async function testTreasurySplit<T extends MyContext>(
  context: T,
  treasuryOutput: Record<string, bigint>
) {
  const { lucid, users, systemParams } = context;
  lucid.selectWallet.fromSeed(users.admin.seedPhrase);

  const params = mkTreasuryParamsFromSP(systemParams.treasuryParams);
  const treasuryAddress = mkTreasuryAddress(params, lucid.config().network!);

  // Create treasury outputs
  await runAndAwaitTx(
    lucid,
    Promise.resolve(
      lucid.newTx().pay.ToContract(
          treasuryAddress,
          { kind: 'inline', value: Data.void() },
          treasuryOutput
        ),
    )
  );

  const [treasuryUtxo] = await findTreasuryOutputs(lucid, params);

  lucid.selectWallet.fromSeed(users.user.seedPhrase);

  await runAndAwaitTx(
    lucid,
    treasurySplit(
      treasuryUtxo,
      lucid,
      {
        txHash: systemParams.scriptReferences.treasuryValidatorRef.input.transactionId,
        outputIndex: Number(systemParams.scriptReferences.treasuryValidatorRef.input.index),
      },
      params
    )
  );
}

test<MyContext>('Treasury - Split (lovelace and single asset)', async (context: MyContext) => {
  await testTreasurySplit(context,
    { lovelace: 50_000_000n, [examplePolicyId + exampleTokenName1]: 1n },
  );
});