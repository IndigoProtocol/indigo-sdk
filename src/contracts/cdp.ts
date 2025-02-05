import { LucidEvolution } from '@lucid-evolution/lucid';
import { SystemParams } from '../types/system-params';

export class CDP {
  static async openPosition(
    asset: string,
    collateralAmount: bigint,
    mintedAmount: bigint,
    params: SystemParams,
    lucid: LucidEvolution,
  ) {
    throw new Error('Not implemented');
  }
}
