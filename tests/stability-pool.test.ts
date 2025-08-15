import { beforeEach, test } from "vitest";
import { LucidContext } from "./test-helpers";
import { Lucid } from "@lucid-evolution/lucid";
import { Emulator } from "@lucid-evolution/lucid";
import { generateEmulatorAccount } from "@lucid-evolution/lucid";

beforeEach<LucidContext>(async (context: LucidContext) => {
    context.users = {
        minter: generateEmulatorAccount({
            lovelace: BigInt(100_000_000),
        }),
        user: generateEmulatorAccount({
            lovelace: BigInt(100_000_000),
        }),
    };

    context.emulator = new Emulator([
        context.users.minter,
        context.users.user,
    ]);

    context.lucid = await Lucid(context.emulator, "Custom");
});

test<LucidContext>("Stability Pool - Create Account", async ({
    lucid,
    users,
    emulator,
}: LucidContext) => {
   
});