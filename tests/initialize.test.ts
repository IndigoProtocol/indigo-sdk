import { beforeEach, test } from "vitest";
import { LucidContext } from "./utils";
import { Lucid } from "@lucid-evolution/lucid";
import { Emulator } from "@lucid-evolution/lucid";
import { generateEmulatorAccount } from "@lucid-evolution/lucid";
import { mint } from "../src/endpoints/token/mint";
import { update } from "../src/endpoints/token/update";
import { TokenMetadata } from "../src/core/types";

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

test<LucidContext>("Test - Allows minting for the reference token and fungible tokens", async ({
    lucid,
    users,
    emulator,
}: LucidContext) => {
    const metadata: TokenMetadata = {
        name: "QuackToken",
        ticker: "QUACK",
        description: "A token for quacking",
        url: "https://quack.com",
        decimals: 0,
        logo: "https://quack.com/logo.png",
    };

    lucid.selectWallet.fromSeed(users.minter.seedPhrase);

    const mintTx = await mint(lucid, metadata);
    const tx = await mintTx.tx.sign.withWallet().complete();
    const txHash = await tx.submit();

    emulator.awaitTx(txHash);
});

test<LucidContext>("Test - Allows updating of the token metadata", async ({
    lucid,
    users,
    emulator,
}: LucidContext) => {
    const metadata: TokenMetadata = {
        name: "QuackToken",
        ticker: "QUACK",
        description: "A token for quacking",
        url: "https://quack.com",
        decimals: 0,
        logo: "https://quack.com/logo.png",
    };

    lucid.selectWallet.fromSeed(users.minter.seedPhrase);

    const mintTx = await mint(lucid, metadata);
    const mintBtx = await mintTx.tx.sign.withWallet().complete();
    const mintTxHash = await mintBtx.submit();

    emulator.awaitTx(mintTxHash);

    const updatedMetadata: TokenMetadata = {
        name: "MooToken",
        ticker: "MOO",
        description: "A token for mooing",
        url: "https://moo.com",
        decimals: 0,
        logo: "https://moo.com/logo.png",
    };

    const updateTx = await update(lucid, mintTx.tokenConfig, updatedMetadata);
    const updateBtx = await updateTx.sign.withWallet().complete();
    const updateTxHash = await updateBtx.submit();

    emulator.awaitTx(updateTxHash);
});