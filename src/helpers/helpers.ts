import * as fs from 'fs';
import { SystemParams } from '../types/system-params';

export function calculateFeeFromPercentage(percent: bigint, amount: bigint): bigint {
    if (amount <= 0n) return 0n;
    const a = (amount * percent / 1_000_000n)
    const b = BigInt(100_000_000);
    return (a * 1_000_000n) / b
}

export function loadSystemParamsFromFile(file: string): SystemParams {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as SystemParams;
}

export function loadSystemParamsFromUrl(url: string): Promise<SystemParams> {
    return fetch(url).then((res: Response) => res.json()).then((data: any) => data as SystemParams);
}