import { beforeEach, test } from "vitest";
import { LucidContext, runAndAwaitTx } from "./test-helpers";
import { fromText, Lucid } from "@lucid-evolution/lucid";
import { Emulator } from "@lucid-evolution/lucid";
import { generateEmulatorAccount } from "@lucid-evolution/lucid";
import { init } from "./endpoints/initialize";
import { addrDetails, CDPContract, StabilityPoolContract } from "../src";
import { findStabilityPool, findStabilityPoolAccount } from "./queries/stability-pool-queries";


beforeEach<LucidContext>(async (context: LucidContext) => {
    context.users = {
        admin: generateEmulatorAccount({
            lovelace: BigInt(100_000_000_000_000),
        }),
    };

    context.emulator = new Emulator([
        context.users.admin,
    ]);

    context.lucid = await Lucid(context.emulator, "Custom");
});

test<LucidContext>("Stability Pool - Create Position", async ({
    lucid,
    users,
    emulator,
}: LucidContext) => {
    lucid.selectWallet.fromSeed(users.admin.seedPhrase);
    const systemParams = await init(lucid, emulator.now());
    const [pkh, _] = await addrDetails(lucid);

    await runAndAwaitTx(lucid, CDPContract.openPosition('iUSD', 1_000_000_000n, 20n, systemParams, lucid, undefined, undefined, undefined, undefined, undefined, emulator.now()));

    await runAndAwaitTx(lucid, StabilityPoolContract.createAccount('iUSD', 10n, systemParams, lucid));

    console.log(systemParams.validatorHashes.stabilityPoolHash);

    const accountUtxo = await findStabilityPoolAccount(
        lucid, 
        lucid.config().network, 
        systemParams.validatorHashes.stabilityPoolHash,
        pkh.hash, 
        'iUSD'
    );

    const stabilityPoolUtxo = await findStabilityPool(
        lucid, 
        lucid.config().network, 
        systemParams.validatorHashes.stabilityPoolHash, 
        {
            currencySymbol: systemParams.stabilityPoolParams.stabilityPoolToken[0].unCurrencySymbol,
            tokenName: fromText(systemParams.stabilityPoolParams.stabilityPoolToken[1].unTokenName),
        }, 
        'iUSD'
    );

    // await runAndAwaitTx(lucid, StabilityPoolContract.adjustAccount('iUSD', 10n, ))
});