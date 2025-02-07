import { SystemParams } from "../types";
import * as fs from 'fs';

export function calculateFeeFromPercentage(percent: bigint, amount: bigint): bigint {
    return (amount * percent) / BigInt(100_000_000);
}

export function loadSystemParamsFromFile(file: string): SystemParams {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as SystemParams;
}

export function loadSystemParamsFromUrl(url: string): Promise<SystemParams> {
    return fetch(url).then((res: Response) => res.json()).then((data: any) => data as SystemParams);
}