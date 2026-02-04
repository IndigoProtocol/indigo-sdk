import { beforeEach, expect, test, vi } from 'vitest';
import {
  addrDetails,
  cdpCollateralRatioPercentage,
  fromSystemParamsAsset,
  getInlineDatumOrThrow,
  LRPDatum,
  LrpParamsSP,
  openLrp,
  parseInterestOracleDatum,
  parsePriceOracleDatum,
  SystemParams,
} from '../src';
import {
  addAssets,
  Emulator,
  EmulatorAccount,
  fromText,
  generateEmulatorAccount,
  Lucid,
  toText,
  UTxO,
} from '@lucid-evolution/lucid';
import { findAllNecessaryOrefs, findCdp } from './queries/cdp-queries';
import { LucidContext, runAndAwaitTx } from './test-helpers';
import { describe } from 'vitest';
import {
  assetClassValueOf,
  lovelacesAmt,
  mkLovelacesOf,
} from '../src/utils/value-helpers';
import { init } from './endpoints/initialize';
import { iusdInitialAssetCfg } from './mock/assets-mock';
import { findAllLrps } from './queries/lrp-queries';
import { ocdFloor, OnChainDecimal } from '../src/types/on-chain-decimal';
import { assertValueInRange } from './utils/asserts';

import {
  calculateLeverageFromCollateralRatio,
  MAX_REDEMPTIONS_WITH_CDP_OPEN,
} from '../src/contracts/leverage/helpers';
import { leverageCdpWithLrp } from '../src/contracts/leverage/transactions';
import {
  calculateTotalAdaForRedemption,
  lrpRedeemableLovelacesInclReimb,
  MIN_LRP_COLLATERAL_AMT,
  randomLrpsSubsetSatisfyingTargetLovelaces,
} from '../src/contracts/lrp/helpers';

type MyContext = LucidContext<{
  admin: EmulatorAccount;
  user: EmulatorAccount;
}>;

async function openLrps(
  context: MyContext,
  sysParams: SystemParams,
  iasset: string,
  amountsToSpend: bigint[],
  maxPrice: OnChainDecimal,
): Promise<void> {
  for (const amt of amountsToSpend) {
    await runAndAwaitTx(
      context.lucid,
      openLrp(iasset, amt, maxPrice, context.lucid, sysParams),
    );
  }
}

function hadLrpRedemption(
  lrp: { utxo: UTxO; datum: LRPDatum },
  lrpParams: LrpParamsSP,
): boolean {
  return (
    assetClassValueOf(lrp.utxo.assets, {
      currencySymbol: lrpParams.iassetPolicyId.unCurrencySymbol,
      tokenName: lrp.datum.iasset,
    }) > 0
  );
}

describe('randomLrpsSubsetSatisfyingTargetLovelaces', () => {
  const mockUtxo = (ada: bigint): UTxO => ({
    address: '',
    assets: mkLovelacesOf(ada),
    outputIndex: 0,
    txHash: '',
  });

  const mockLrpParams: LrpParamsSP = {
    iassetNft: [{ unCurrencySymbol: '' }, { unTokenName: '' }],
    iassetPolicyId: { unCurrencySymbol: '' },
    minRedemptionLovelacesAmt: 10n,
    versionRecordToken: [{ unCurrencySymbol: '' }, { unTokenName: '' }],
  };

  test('1', () => {
    const lrps: [UTxO, LRPDatum][] = [
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
    ];

    expect(
      randomLrpsSubsetSatisfyingTargetLovelaces(
        'iUSD',
        120n,
        { getOnChainInt: 1_000_000n },
        lrps,
        mockLrpParams,
        MAX_REDEMPTIONS_WITH_CDP_OPEN,
      ),
    ).toEqual(expect.arrayContaining(lrps));
  });

  test('2', () => {
    const lrps: [UTxO, LRPDatum][] = [
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
    ];

    expect(
      randomLrpsSubsetSatisfyingTargetLovelaces(
        'iUSD',
        100n,
        { getOnChainInt: 1_000_000n },
        lrps,
        mockLrpParams,
        MAX_REDEMPTIONS_WITH_CDP_OPEN,
      ),
    ).toEqual(lrps);
  });

  test('filtering by iasset 1', () => {
    const lrps: [UTxO, LRPDatum][] = [
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(100n),
        {
          iasset: 'iBTC',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
    ];

    expect(
      randomLrpsSubsetSatisfyingTargetLovelaces(
        'iUSD',
        110n,
        { getOnChainInt: 1_000_000n },
        lrps,
        mockLrpParams,
        MAX_REDEMPTIONS_WITH_CDP_OPEN,
      ),
    ).toEqual(expect.arrayContaining([lrps[0], lrps[2]]));
  });

  test('filtering by iasset 2', () => {
    const lrps: [UTxO, LRPDatum][] = [
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(100n),
        {
          iasset: 'iBTC',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
    ];

    expect(() =>
      randomLrpsSubsetSatisfyingTargetLovelaces(
        'iUSD',
        110n,
        { getOnChainInt: 1_000_000n },
        lrps,
        mockLrpParams,
        MAX_REDEMPTIONS_WITH_CDP_OPEN,
      ),
    ).toThrowError("Couldn't achieve target lovelaces");
  });

  test('filtering by price 1', () => {
    const lrps: [UTxO, LRPDatum][] = [
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_500_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
    ];

    expect(() =>
      randomLrpsSubsetSatisfyingTargetLovelaces(
        'iUSD',
        120n,
        { getOnChainInt: 1_100_000n },
        lrps,
        mockLrpParams,
        MAX_REDEMPTIONS_WITH_CDP_OPEN,
      ),
    ).toThrowError("Couldn't achieve target lovelaces");
  });

  test('filtering by price 2', () => {
    const lrps: [UTxO, LRPDatum][] = [
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 50n,
          maxPrice: { getOnChainInt: 1_500_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_300_000n },
          owner: '',
        },
      ],
    ];

    expect(
      randomLrpsSubsetSatisfyingTargetLovelaces(
        'iUSD',
        120n,
        { getOnChainInt: 1_100_000n },
        lrps,
        mockLrpParams,
        MAX_REDEMPTIONS_WITH_CDP_OPEN,
      ),
    ).toEqual(expect.arrayContaining([lrps[0], lrps[2]]));
  });

  test('min redemption check 1', () => {
    const lrps: [UTxO, LRPDatum][] = [
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
    ];

    const mockedShuffle = vi.fn().mockImplementation(() => lrps);

    expect(
      randomLrpsSubsetSatisfyingTargetLovelaces(
        'iUSD',
        105n,
        { getOnChainInt: 1_000_000n },
        lrps,
        mockLrpParams,
        MAX_REDEMPTIONS_WITH_CDP_OPEN,
        mockedShuffle,
      ),
    ).toEqual([lrps[0]]);
  });

  test('min redemption check 2', () => {
    const lrps: [UTxO, LRPDatum][] = [
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(5n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 5n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
    ];

    const mockedShuffle = vi.fn().mockImplementation(() => lrps);

    expect(
      randomLrpsSubsetSatisfyingTargetLovelaces(
        'iUSD',
        120n,
        { getOnChainInt: 1_000_000n },
        lrps,
        mockLrpParams,
        MAX_REDEMPTIONS_WITH_CDP_OPEN,
        mockedShuffle,
      ),
    ).toEqual([lrps[0], lrps[2]]);
  });

  test('min redemption check 3', () => {
    const lrps: [UTxO, LRPDatum][] = [
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(15n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 15n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
    ];

    const mockedShuffle = vi.fn().mockImplementation(() => lrps);

    expect(
      randomLrpsSubsetSatisfyingTargetLovelaces(
        'iUSD',
        120n,
        { getOnChainInt: 1_000_000n },
        lrps,
        mockLrpParams,
        MAX_REDEMPTIONS_WITH_CDP_OPEN,
        mockedShuffle,
      ),
    ).toEqual([lrps[0], lrps[2]]);
  });

  test('max redemptions check 1', () => {
    const lrps: [UTxO, LRPDatum][] = [
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(90n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 90n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(80n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 80n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(70n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 70n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
    ];

    const mockedShuffle = vi.fn().mockImplementation(() => lrps);

    expect(MAX_REDEMPTIONS_WITH_CDP_OPEN).toBe(4);

    expect(
      randomLrpsSubsetSatisfyingTargetLovelaces(
        'iUSD',
        360n,
        { getOnChainInt: 1_000_000n },
        lrps,
        mockLrpParams,
        MAX_REDEMPTIONS_WITH_CDP_OPEN,
        mockedShuffle,
      ),
    ).toEqual(expect.arrayContaining([lrps[0], lrps[1], lrps[2], lrps[4]]));
  });
});

describe('lrpRedeemableLovelacesInclReimb', () => {
  const mockUtxo = (ada: bigint): UTxO => ({
    address: '',
    assets: mkLovelacesOf(ada),
    outputIndex: 0,
    txHash: '',
  });

  const mockLrpParams: LrpParamsSP = {
    iassetNft: [{ unCurrencySymbol: '' }, { unTokenName: '' }],
    iassetPolicyId: { unCurrencySymbol: '' },
    minRedemptionLovelacesAmt: 10n,
    versionRecordToken: [{ unCurrencySymbol: '' }, { unTokenName: '' }],
  };

  test('1', () => {
    expect(
      lrpRedeemableLovelacesInclReimb(
        [
          mockUtxo(110n),
          {
            iasset: 'iUSD',
            lovelacesToSpend: 100n,
            maxPrice: { getOnChainInt: 1_000_000n },
            owner: '',
          },
        ],
        mockLrpParams,
      ),
    ).toEqual<bigint>(100n);
  });

  test('capped to UTXO value', () => {
    expect(
      lrpRedeemableLovelacesInclReimb(
        [
          mockUtxo(20_000_000n),
          {
            iasset: 'iUSD',
            lovelacesToSpend: 100_000_000n,
            maxPrice: { getOnChainInt: 1_000_000n },
            owner: '',
          },
        ],
        mockLrpParams,
      ),
    ).toEqual<bigint>(20_000_000n - MIN_LRP_COLLATERAL_AMT);
  });

  test('less than min redemption', () => {
    expect(
      lrpRedeemableLovelacesInclReimb(
        [
          mockUtxo(20n),
          {
            iasset: 'iUSD',
            lovelacesToSpend: 5n,
            maxPrice: { getOnChainInt: 1_000_000n },
            owner: '',
          },
        ],
        mockLrpParams,
      ),
    ).toEqual<bigint>(0n);
  });
});

describe('calculateTotalAdaForRedemption', () => {
  const mockUtxo = (ada: bigint): UTxO => ({
    address: '',
    assets: mkLovelacesOf(ada),
    outputIndex: 0,
    txHash: '',
  });

  const mockLrpParams: LrpParamsSP = {
    iassetNft: [{ unCurrencySymbol: '' }, { unTokenName: '' }],
    iassetPolicyId: { unCurrencySymbol: '' },
    minRedemptionLovelacesAmt: 10n,
    versionRecordToken: [{ unCurrencySymbol: '' }, { unTokenName: '' }],
  };

  test('1', () => {
    const lrps: [UTxO, LRPDatum][] = [
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(100n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
    ];

    expect(
      calculateTotalAdaForRedemption(
        'iUSD',
        { getOnChainInt: 1_000_000n },
        mockLrpParams,
        lrps,
        MAX_REDEMPTIONS_WITH_CDP_OPEN,
      ),
      // Because of rounding, the reimbursement isn't subtracted
    ).toEqual<bigint>(200n);
  });

  test('2', () => {
    const lrps: [UTxO, LRPDatum][] = [
      [
        mockUtxo(1000n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 1000n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(1000n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 1000n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
    ];

    expect(
      calculateTotalAdaForRedemption(
        'iUSD',
        { getOnChainInt: 1_000_000n },
        mockLrpParams,
        lrps,
        MAX_REDEMPTIONS_WITH_CDP_OPEN,
      ),
    ).toEqual<bigint>(2000n);
  });

  test('filtering by assets 1', () => {
    const lrps: [UTxO, LRPDatum][] = [
      [
        mockUtxo(1000n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 1000n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(1000n),
        {
          iasset: 'iBTC',
          lovelacesToSpend: 1000n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(1000n),
        {
          iasset: 'iETH',
          lovelacesToSpend: 1000n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
    ];

    expect(
      calculateTotalAdaForRedemption(
        'iUSD',
        { getOnChainInt: 1_000_000n },
        mockLrpParams,
        lrps,
        MAX_REDEMPTIONS_WITH_CDP_OPEN,
      ),
    ).toEqual<bigint>(1000n);
  });

  test('filtering by price 1', () => {
    const lrps: [UTxO, LRPDatum][] = [
      [
        mockUtxo(1000n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 1000n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(1000n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 1000n,
          maxPrice: { getOnChainInt: 1_500_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(1000n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 1000n,
          maxPrice: { getOnChainInt: 800_000n },
          owner: '',
        },
      ],
    ];

    expect(
      calculateTotalAdaForRedemption(
        'iUSD',
        { getOnChainInt: 1_100_000n },
        mockLrpParams,
        lrps,
        MAX_REDEMPTIONS_WITH_CDP_OPEN,
      ),
    ).toEqual<bigint>(1000n);
  });

  test('capping by max redemptions 1', () => {
    const lrps: [UTxO, LRPDatum][] = [
      [
        mockUtxo(1000n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 1000n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(1400n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 1400n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(1600n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 1600n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(1800n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 1800n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(2000n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 2000n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
    ];

    expect(MAX_REDEMPTIONS_WITH_CDP_OPEN).toBe(4);

    expect(
      calculateTotalAdaForRedemption(
        'iUSD',
        { getOnChainInt: 1_000_000n },
        mockLrpParams,
        lrps,
        MAX_REDEMPTIONS_WITH_CDP_OPEN,
      ),
      // I.e. the one with 1000n lovelaces is dropped
    ).toEqual<bigint>(6800n);
  });

  test('incorrectly initialised LRPs 1', () => {
    const lrps: [UTxO, LRPDatum][] = [
      // This one should be capped to the UTXO value
      [
        mockUtxo(20_000_000n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 100_000_000n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(1000n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 1000n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      [
        mockUtxo(1000n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 1000n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
      // This one shold get dropped since less than min
      [
        mockUtxo(1000n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 5n,
          maxPrice: { getOnChainInt: 1_000_000n },
          owner: '',
        },
      ],
    ];

    expect(
      calculateTotalAdaForRedemption(
        'iUSD',
        { getOnChainInt: 1_000_000n },
        mockLrpParams,
        lrps,
        MAX_REDEMPTIONS_WITH_CDP_OPEN,
      ),
    ).toEqual<bigint>(18_002_000n);
  });
});

describe('LRP leverage', () => {
  beforeEach<MyContext>(async (context: MyContext) => {
    context.users = {
      admin: generateEmulatorAccount({
        lovelace: BigInt(100_000_000_000_000),
      }),
      user: generateEmulatorAccount(addAssets(mkLovelacesOf(150_000_000n))),
    };

    context.emulator = new Emulator([context.users.admin, context.users.user]);
    context.lucid = await Lucid(context.emulator, 'Custom');
  });

  test<MyContext>('Open 2x leveraged CDP; 1 LRP; price ~1.1; f_r=.01; f_m=.005', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, __] = await init(context.lucid, [
      {
        ...iusdInitialAssetCfg,
        priceOracle: {
          ...iusdInitialAssetCfg.priceOracle,
          startPrice: 1_104_093n,
        },
        interestOracle: {
          ...iusdInitialAssetCfg.interestOracle,
          initialInterestRate: 0n,
        },
        maintenanceRatioPercentage: 150_000_000n,
        debtMintingFeePercentage: 500_000n,
        redemptionReimbursementPercentage: 1_000_000n,
      },
    ]);

    const iasset = fromText(iusdInitialAssetCfg.name);

    await openLrps(context, sysParams, iasset, [100_000_000n], {
      getOnChainInt: 1_500_000n,
    });

    const allLrps = await findAllLrps(context.lucid, sysParams, iasset);

    const orefs = await findAllNecessaryOrefs(
      context.lucid,
      sysParams,
      toText(iasset),
    );

    const baseCollateral = 20_000_000n;
    await runAndAwaitTx(
      context.lucid,
      leverageCdpWithLrp(
        2,
        baseCollateral,
        orefs.priceOracleUtxo,
        orefs.iasset.utxo,
        orefs.cdpCreatorUtxo,
        orefs.interestOracleUtxo,
        orefs.collectorUtxo,
        sysParams,
        context.lucid,
        allLrps.map((lrps) => [lrps.utxo, lrps.datum]),
        context.emulator.slot,
      ),
    );

    const [pkh, skh] = await addrDetails(context.lucid);

    const res = await findCdp(
      context.lucid,
      sysParams.validatorHashes.cdpHash,
      fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
      pkh.hash,
      skh,
    );

    // Assert leverage
    assertValueInRange(
      Number(lovelacesAmt(res.utxo.assets)) / Number(baseCollateral),
      {
        min: 2,
        max: 2.001,
      },
    );

    // Assert collateral ratio
    assertValueInRange(
      cdpCollateralRatioPercentage(
        context.emulator.slot,
        parsePriceOracleDatum(getInlineDatumOrThrow(orefs.priceOracleUtxo))
          .price,
        res.utxo,
        res.datum,
        parseInterestOracleDatum(
          getInlineDatumOrThrow(orefs.interestOracleUtxo),
        ),
        context.lucid.config().network!,
      ),
      {
        min: 197,
        max: 197.001,
      },
    );
  });

  test<MyContext>('Open 2x leveraged CDP; 4 LRPs; price ~0.9; f_r=.01; f_m=.005', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, __] = await init(context.lucid, [
      {
        ...iusdInitialAssetCfg,
        priceOracle: {
          ...iusdInitialAssetCfg.priceOracle,
          startPrice: 904_093n,
        },
        interestOracle: {
          ...iusdInitialAssetCfg.interestOracle,
          initialInterestRate: 0n,
        },
        maintenanceRatioPercentage: 150_000_000n,
        debtMintingFeePercentage: 500_000n,
        redemptionReimbursementPercentage: 1_000_000n,
      },
    ]);

    const iasset = fromText(iusdInitialAssetCfg.name);

    await openLrps(
      context,
      sysParams,
      iasset,
      [26_250_000n, 26_250_000n, 26_250_000n, 26_250_000n],
      {
        getOnChainInt: 1_500_000n,
      },
    );

    const allLrps = await findAllLrps(context.lucid, sysParams, iasset);

    const orefs = await findAllNecessaryOrefs(
      context.lucid,
      sysParams,
      toText(iasset),
    );

    const baseCollateral = 100_000_000n;
    await runAndAwaitTx(
      context.lucid,
      leverageCdpWithLrp(
        2,
        baseCollateral,
        orefs.priceOracleUtxo,
        orefs.iasset.utxo,
        orefs.cdpCreatorUtxo,
        orefs.interestOracleUtxo,
        orefs.collectorUtxo,
        sysParams,
        context.lucid,
        allLrps.map((lrps) => [lrps.utxo, lrps.datum]),
        context.emulator.slot,
      ),
    );

    const [pkh, skh] = await addrDetails(context.lucid);

    const res = await findCdp(
      context.lucid,
      sysParams.validatorHashes.cdpHash,
      fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
      pkh.hash,
      skh,
    );

    // Assert leverage
    assertValueInRange(
      Number(lovelacesAmt(res.utxo.assets)) / Number(baseCollateral),
      {
        min: 2,
        max: 2.001,
      },
    );

    // Assert collateral ratio
    assertValueInRange(
      cdpCollateralRatioPercentage(
        context.emulator.slot,
        parsePriceOracleDatum(getInlineDatumOrThrow(orefs.priceOracleUtxo))
          .price,
        res.utxo,
        res.datum,
        parseInterestOracleDatum(
          getInlineDatumOrThrow(orefs.interestOracleUtxo),
        ),
        context.lucid.config().network!,
      ),
      {
        min: 197,
        max: 197.001,
      },
    );

    {
      const lrps = await findAllLrps(context.lucid, sysParams, iasset);
      expect(
        lrps.every((lrp) => hadLrpRedemption(lrp, sysParams.lrpParams)),
      ).toBeTruthy();
    }
  });

  test<MyContext>('Open 2.3x leveraged CDP; 4 LRPs; price ~1.03; f_r=.01; f_m=.013', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, __] = await init(context.lucid, [
      {
        ...iusdInitialAssetCfg,
        priceOracle: {
          ...iusdInitialAssetCfg.priceOracle,
          startPrice: 1_037_093n,
        },
        interestOracle: {
          ...iusdInitialAssetCfg.interestOracle,
          initialInterestRate: 0n,
        },
        maintenanceRatioPercentage: 150_000_000n,
        debtMintingFeePercentage: 1_300_000n,
        redemptionReimbursementPercentage: 1_000_000n,
      },
    ]);

    const iasset = fromText(iusdInitialAssetCfg.name);

    await openLrps(
      context,
      sysParams,
      iasset,
      [35_139_729n, 35_000_397n, 35_001_079n, 35_107_049n],
      {
        getOnChainInt: 1_500_000n,
      },
    );

    const allLrps = await findAllLrps(context.lucid, sysParams, iasset);

    const orefs = await findAllNecessaryOrefs(
      context.lucid,
      sysParams,
      toText(iasset),
    );

    const baseCollateral = 100_000_000n;
    await runAndAwaitTx(
      context.lucid,
      leverageCdpWithLrp(
        2.3,
        baseCollateral,
        orefs.priceOracleUtxo,
        orefs.iasset.utxo,
        orefs.cdpCreatorUtxo,
        orefs.interestOracleUtxo,
        orefs.collectorUtxo,
        sysParams,
        context.lucid,
        allLrps.map((lrps) => [lrps.utxo, lrps.datum]),
        context.emulator.slot,
      ),
    );

    const [pkh, skh] = await addrDetails(context.lucid);

    const res = await findCdp(
      context.lucid,
      sysParams.validatorHashes.cdpHash,
      fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
      pkh.hash,
      skh,
    );

    // Assert leverage
    assertValueInRange(
      Number(lovelacesAmt(res.utxo.assets)) / Number(baseCollateral),
      {
        min: 2.3,
        max: 2.301,
      },
    );

    // Assert collateral ratio
    assertValueInRange(
      cdpCollateralRatioPercentage(
        context.emulator.slot,
        parsePriceOracleDatum(getInlineDatumOrThrow(orefs.priceOracleUtxo))
          .price,
        res.utxo,
        res.datum,
        parseInterestOracleDatum(
          getInlineDatumOrThrow(orefs.interestOracleUtxo),
        ),
        context.lucid.config().network!,
      ),
      {
        min: 172.8,
        max: 172.9,
      },
    );

    {
      const lrps = await findAllLrps(context.lucid, sysParams, iasset);
      expect(
        lrps.every((lrp) => hadLrpRedemption(lrp, sysParams.lrpParams)),
      ).toBeTruthy();
    }
  });

  test<MyContext>('Open 1.2x leveraged CDP 3 LRPs price ~1.46; f_r=.02; f_m=.007', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, __] = await init(context.lucid, [
      {
        ...iusdInitialAssetCfg,
        priceOracle: {
          ...iusdInitialAssetCfg.priceOracle,
          startPrice: 1_461_093n,
        },
        interestOracle: {
          ...iusdInitialAssetCfg.interestOracle,
          initialInterestRate: 0n,
        },
        maintenanceRatioPercentage: 150_000_000n,
        debtMintingFeePercentage: 700_000n,
        redemptionReimbursementPercentage: 2_000_000n,
      },
    ]);

    const iasset = fromText(iusdInitialAssetCfg.name);

    await openLrps(
      context,
      sysParams,
      iasset,
      [75_000_000n, 75_000_000n, 75_000_000n],
      {
        getOnChainInt: 1_500_000n,
      },
    );

    const allLrps = await findAllLrps(context.lucid, sysParams, iasset);

    const orefs = await findAllNecessaryOrefs(
      context.lucid,
      sysParams,
      toText(iasset),
    );

    const baseCollateral = 1_000_000_000n;
    await runAndAwaitTx(
      context.lucid,
      leverageCdpWithLrp(
        1.2,
        baseCollateral,
        orefs.priceOracleUtxo,
        orefs.iasset.utxo,
        orefs.cdpCreatorUtxo,
        orefs.interestOracleUtxo,
        orefs.collectorUtxo,
        sysParams,
        context.lucid,
        allLrps.map((lrps) => [lrps.utxo, lrps.datum]),
        context.emulator.slot,
      ),
    );

    const [pkh, skh] = await addrDetails(context.lucid);

    const res = await findCdp(
      context.lucid,
      sysParams.validatorHashes.cdpHash,
      fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
      pkh.hash,
      skh,
    );

    // Assert leverage
    assertValueInRange(
      Number(lovelacesAmt(res.utxo.assets)) / Number(baseCollateral),
      {
        min: 1.2,
        max: 1.2001,
      },
    );

    // Assert collateral ratio
    assertValueInRange(
      cdpCollateralRatioPercentage(
        context.emulator.slot,
        parsePriceOracleDatum(getInlineDatumOrThrow(orefs.priceOracleUtxo))
          .price,
        res.utxo,
        res.datum,
        parseInterestOracleDatum(
          getInlineDatumOrThrow(orefs.interestOracleUtxo),
        ),
        context.lucid.config().network!,
      ),
      {
        min: 583.79,
        max: 583.8,
      },
    );

    {
      const lrps = await findAllLrps(context.lucid, sysParams, iasset);
      expect(
        lrps.every((lrp) => hadLrpRedemption(lrp, sysParams.lrpParams)),
      ).toBeTruthy();
    }
  });

  test<MyContext>('Open max leverage leveraged CDP; 4 CDPs; price 1; f_r=.01; f_m=.005', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, __] = await init(context.lucid, [
      {
        ...iusdInitialAssetCfg,
        priceOracle: {
          ...iusdInitialAssetCfg.priceOracle,
          startPrice: 1_000_000n,
        },
        interestOracle: {
          ...iusdInitialAssetCfg.interestOracle,
          initialInterestRate: 0n,
        },
        maintenanceRatioPercentage: 150_000_000n,
        debtMintingFeePercentage: 500_000n,
        redemptionReimbursementPercentage: 1_000_000n,
      },
    ]);

    const iasset = fromText(iusdInitialAssetCfg.name);

    await openLrps(
      context,
      sysParams,
      iasset,
      [500_000_000n, 500_000_000n, 500_000_000n, 500_000_000n],
      {
        getOnChainInt: 1_500_000n,
      },
    );

    const allLrps = await findAllLrps(context.lucid, sysParams, iasset);

    const orefs = await findAllNecessaryOrefs(
      context.lucid,
      sysParams,
      toText(iasset),
    );

    const baseCollateral = 1_000_000_000n;
    const maxLeverage = calculateLeverageFromCollateralRatio(
      iasset,
      orefs.iasset.datum.maintenanceRatio,
      baseCollateral,
      parsePriceOracleDatum(getInlineDatumOrThrow(orefs.priceOracleUtxo)).price,
      orefs.iasset.datum.debtMintingFeePercentage,
      orefs.iasset.datum.redemptionReimbursementPercentage,
      sysParams.lrpParams,
      allLrps.map((lrps) => [lrps.utxo, lrps.datum]),
    )!;

    await runAndAwaitTx(
      context.lucid,
      leverageCdpWithLrp(
        maxLeverage,
        baseCollateral,
        orefs.priceOracleUtxo,
        orefs.iasset.utxo,
        orefs.cdpCreatorUtxo,
        orefs.interestOracleUtxo,
        orefs.collectorUtxo,
        sysParams,
        context.lucid,
        allLrps.map((lrps) => [lrps.utxo, lrps.datum]),
        context.emulator.slot,
      ),
    );

    const [pkh, skh] = await addrDetails(context.lucid);

    const res = await findCdp(
      context.lucid,
      sysParams.validatorHashes.cdpHash,
      fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
      pkh.hash,
      skh,
    );

    // Assert leverage
    assertValueInRange(
      Number(lovelacesAmt(res.utxo.assets)) / Number(baseCollateral),
      {
        min: 2.9126,
        max: 2.9127,
      },
    );

    // Assert collateral ratio
    assertValueInRange(
      cdpCollateralRatioPercentage(
        context.emulator.slot,
        parsePriceOracleDatum(getInlineDatumOrThrow(orefs.priceOracleUtxo))
          .price,
        res.utxo,
        res.datum,
        parseInterestOracleDatum(
          getInlineDatumOrThrow(orefs.interestOracleUtxo),
        ),
        context.lucid.config().network!,
      ),
      {
        min: Number(ocdFloor(orefs.iasset.datum.maintenanceRatio)),
        max: Number(ocdFloor(orefs.iasset.datum.maintenanceRatio)) + 1,
      },
    );

    {
      const lrps = await findAllLrps(context.lucid, sysParams, iasset);
      expect(
        lrps.every((lrp) => hadLrpRedemption(lrp, sysParams.lrpParams)),
      ).toBeTruthy();
    }
  });

  test<MyContext>('Open max leverage leveraged CDP; 2 CDPs; price 2.5; f_r=.014; f_m=.006', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, __] = await init(context.lucid, [
      {
        ...iusdInitialAssetCfg,
        priceOracle: {
          ...iusdInitialAssetCfg.priceOracle,
          startPrice: 2_500_000n,
        },
        interestOracle: {
          ...iusdInitialAssetCfg.interestOracle,
          initialInterestRate: 0n,
        },
        maintenanceRatioPercentage: 130_000_000n,
        debtMintingFeePercentage: 600_000n,
        redemptionReimbursementPercentage: 1_400_000n,
      },
    ]);

    const iasset = fromText(iusdInitialAssetCfg.name);

    await openLrps(context, sysParams, iasset, [325_000_000n, 325_000_000n], {
      getOnChainInt: 3_000_000n,
    });

    const allLrps = await findAllLrps(context.lucid, sysParams, iasset);

    const orefs = await findAllNecessaryOrefs(
      context.lucid,
      sysParams,
      toText(iasset),
    );

    const baseCollateral = 200_000_000n;
    const maxLeverage = calculateLeverageFromCollateralRatio(
      iasset,
      orefs.iasset.datum.maintenanceRatio,
      baseCollateral,
      parsePriceOracleDatum(getInlineDatumOrThrow(orefs.priceOracleUtxo)).price,
      orefs.iasset.datum.debtMintingFeePercentage,
      orefs.iasset.datum.redemptionReimbursementPercentage,
      sysParams.lrpParams,
      allLrps.map((lrps) => [lrps.utxo, lrps.datum]),
    )!;

    await runAndAwaitTx(
      context.lucid,
      leverageCdpWithLrp(
        maxLeverage,
        baseCollateral,
        orefs.priceOracleUtxo,
        orefs.iasset.utxo,
        orefs.cdpCreatorUtxo,
        orefs.interestOracleUtxo,
        orefs.collectorUtxo,
        sysParams,
        context.lucid,
        allLrps.map((lrps) => [lrps.utxo, lrps.datum]),
        context.emulator.slot,
      ),
    );

    const [pkh, skh] = await addrDetails(context.lucid);

    const res = await findCdp(
      context.lucid,
      sysParams.validatorHashes.cdpHash,
      fromSystemParamsAsset(sysParams.cdpParams.cdpAuthToken),
      pkh.hash,
      skh,
    );

    // Assert leverage
    assertValueInRange(
      Number(lovelacesAmt(res.utxo.assets)) / Number(baseCollateral),
      {
        min: 4.0625,
        max: 4.06251,
      },
    );

    // Assert collateral ratio
    assertValueInRange(
      cdpCollateralRatioPercentage(
        context.emulator.slot,
        parsePriceOracleDatum(getInlineDatumOrThrow(orefs.priceOracleUtxo))
          .price,
        res.utxo,
        res.datum,
        parseInterestOracleDatum(
          getInlineDatumOrThrow(orefs.interestOracleUtxo),
        ),
        context.lucid.config().network!,
      ),
      {
        min: Number(ocdFloor(orefs.iasset.datum.maintenanceRatio)),
        max: Number(ocdFloor(orefs.iasset.datum.maintenanceRatio)) + 1,
      },
    );

    {
      const lrps = await findAllLrps(context.lucid, sysParams, iasset);
      expect(
        lrps.every((lrp) => hadLrpRedemption(lrp, sysParams.lrpParams)),
      ).toBeTruthy();
    }
  });
});
