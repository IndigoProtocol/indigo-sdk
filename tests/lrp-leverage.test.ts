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
  redeemLrpWithCdpOpen,
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
import { OnChainDecimal } from '../src/types/on-chain-decimal';
import { assertValueInRange } from './utils/asserts';
import {
  calculateMaxLeverage,
  calculateTotalAdaForRedemption,
  lrpRedeemableLovelacesInclReimb,
  MAX_REDEMPTIONS_WITH_CDP_OPEN,
  MIN_LRP_COLLATERAL_AMT,
  randomLrpsSubsetSatisfyingLeverage,
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

describe('randomLrpsSubsetSatisfyingLeverage', () => {
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
      randomLrpsSubsetSatisfyingLeverage(
        'iUSD',
        120n,
        { getOnChainInt: 1_000_000n },
        lrps,
        mockLrpParams,
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
      randomLrpsSubsetSatisfyingLeverage(
        'iUSD',
        100n,
        { getOnChainInt: 1_000_000n },
        lrps,
        mockLrpParams,
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
      randomLrpsSubsetSatisfyingLeverage(
        'iUSD',
        110n,
        { getOnChainInt: 1_000_000n },
        lrps,
        mockLrpParams,
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
      randomLrpsSubsetSatisfyingLeverage(
        'iUSD',
        110n,
        { getOnChainInt: 1_000_000n },
        lrps,
        mockLrpParams,
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
      randomLrpsSubsetSatisfyingLeverage(
        'iUSD',
        120n,
        { getOnChainInt: 1_100_000n },
        lrps,
        mockLrpParams,
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
      randomLrpsSubsetSatisfyingLeverage(
        'iUSD',
        120n,
        { getOnChainInt: 1_100_000n },
        lrps,
        mockLrpParams,
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
      randomLrpsSubsetSatisfyingLeverage(
        'iUSD',
        105n,
        { getOnChainInt: 1_000_000n },
        lrps,
        mockLrpParams,
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
      randomLrpsSubsetSatisfyingLeverage(
        'iUSD',
        120n,
        { getOnChainInt: 1_000_000n },
        lrps,
        mockLrpParams,
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
      randomLrpsSubsetSatisfyingLeverage(
        'iUSD',
        120n,
        { getOnChainInt: 1_000_000n },
        lrps,
        mockLrpParams,
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
        mockUtxo(60n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 60n,
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

    expect(MAX_REDEMPTIONS_WITH_CDP_OPEN).toBe(5);

    expect(
      randomLrpsSubsetSatisfyingLeverage(
        'iUSD',
        420n,
        { getOnChainInt: 1_000_000n },
        lrps,
        mockLrpParams,
        mockedShuffle,
      ),
    ).toEqual(
      expect.arrayContaining([lrps[0], lrps[1], lrps[2], lrps[3], lrps[5]]),
    );
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
        { getOnChainInt: 500_000n },
        { getOnChainInt: 1_000_000n },
        mockLrpParams,
        lrps,
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
        { getOnChainInt: 500_000n },
        { getOnChainInt: 1_000_000n },
        mockLrpParams,
        lrps,
      ),
    ).toEqual<bigint>(1990n);
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
        { getOnChainInt: 500_000n },
        { getOnChainInt: 1_000_000n },
        mockLrpParams,
        lrps,
      ),
    ).toEqual<bigint>(995n);
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
        { getOnChainInt: 500_000n },
        { getOnChainInt: 1_100_000n },
        mockLrpParams,
        lrps,
      ),
    ).toEqual<bigint>(995n);
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
        mockUtxo(1200n),
        {
          iasset: 'iUSD',
          lovelacesToSpend: 1200n,
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

    expect(MAX_REDEMPTIONS_WITH_CDP_OPEN).toBe(5);

    expect(
      calculateTotalAdaForRedemption(
        'iUSD',
        { getOnChainInt: 500_000n },
        { getOnChainInt: 1_000_000n },
        mockLrpParams,
        lrps,
      ),
      // I.e. the one with 1000n lovelaces is dropped
    ).toEqual<bigint>(7960n);
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
        { getOnChainInt: 500_000n },
        { getOnChainInt: 1_000_000n },
        mockLrpParams,
        lrps,
      ),
    ).toEqual<bigint>(17_910_000n + 995n + 995n);
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

  test<MyContext>('Open 2x leveraged CDP single LRP price ~1.1', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, __] = await init(context.lucid, [
      {
        ...iusdInitialAssetCfg,
        priceOracle: {
          ...iusdInitialAssetCfg.priceOracle,
          startPrice: 1_104_093n,
        },
        initerestOracle: {
          ...iusdInitialAssetCfg.initerestOracle,
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
      redeemLrpWithCdpOpen(
        2,
        baseCollateral,
        { getOnChainInt: 160_000_000n },
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
      { max: 2, min: 1.99 },
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
      { max: 161, min: 160 },
    );
  });

  test<MyContext>('Open 2x leveraged CDP 5 LRPs price ~0.9', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, __] = await init(context.lucid, [
      {
        ...iusdInitialAssetCfg,
        priceOracle: {
          ...iusdInitialAssetCfg.priceOracle,
          startPrice: 904_093n,
        },
        initerestOracle: {
          ...iusdInitialAssetCfg.initerestOracle,
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
      [21_000_000n, 21_000_000n, 21_000_000n, 21_000_000n, 21_000_000n],
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
      redeemLrpWithCdpOpen(
        2,
        baseCollateral,
        { getOnChainInt: 160_000_000n },
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
      { max: 2.00000002, min: 2 },
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
      { max: 161, min: 160 },
    );

    {
      const lrps = await findAllLrps(context.lucid, sysParams, iasset);
      expect(
        lrps.every((lrp) => hadLrpRedemption(lrp, sysParams.lrpParams)),
      ).toBeTruthy();
    }
  });

  test<MyContext>('Open 2.3x leveraged CDP 5 LRPs price ~1.03', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, __] = await init(context.lucid, [
      {
        ...iusdInitialAssetCfg,
        priceOracle: {
          ...iusdInitialAssetCfg.priceOracle,
          startPrice: 1_037_093n,
        },
        initerestOracle: {
          ...iusdInitialAssetCfg.initerestOracle,
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
      [28_000_000n, 28_000_000n, 28_000_000n, 28_000_000n, 28_000_000n],
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
      redeemLrpWithCdpOpen(
        2.3,
        baseCollateral,
        { getOnChainInt: 155_000_000n },
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
      { max: 2.30000003, min: 2.3 },
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
      { max: 156, min: 155 },
    );

    {
      const lrps = await findAllLrps(context.lucid, sysParams, iasset);
      expect(
        lrps.every((lrp) => hadLrpRedemption(lrp, sysParams.lrpParams)),
      ).toBeTruthy();
    }
  });

  test<MyContext>('Open 1.2x leveraged CDP 5 LRPs price ~1.46', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, __] = await init(context.lucid, [
      {
        ...iusdInitialAssetCfg,
        priceOracle: {
          ...iusdInitialAssetCfg.priceOracle,
          startPrice: 1_461_093n,
        },
        initerestOracle: {
          ...iusdInitialAssetCfg.initerestOracle,
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
      [45_000_000n, 45_000_000n, 45_000_000n, 45_000_000n, 45_000_000n],
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
      redeemLrpWithCdpOpen(
        1.2,
        baseCollateral,
        { getOnChainInt: 155_000_000n },
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
      { max: 1.200000003, min: 1.2 },
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
      { max: 156, min: 155 },
    );

    {
      const lrps = await findAllLrps(context.lucid, sysParams, iasset);
      expect(
        lrps.every((lrp) => hadLrpRedemption(lrp, sysParams.lrpParams)),
      ).toBeTruthy();
    }
  });

  test<MyContext>('Open max leverage leveraged CDP', async (context: MyContext) => {
    context.lucid.selectWallet.fromSeed(context.users.admin.seedPhrase);

    const [sysParams, __] = await init(context.lucid, [
      {
        ...iusdInitialAssetCfg,
        priceOracle: {
          ...iusdInitialAssetCfg.priceOracle,
          startPrice: 1_000_000n,
        },
        initerestOracle: {
          ...iusdInitialAssetCfg.initerestOracle,
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
      [
        2_000_000_000n,
        2_000_000_000n,
        2_000_000_000n,
        2_000_000_000n,
        2_000_000_000n,
      ],
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
    const targetCollateralRatioPercentage = { getOnChainInt: 155_000_000n };
    const maxLeverage = calculateMaxLeverage(
      iasset,
      baseCollateral,
      targetCollateralRatioPercentage,
      parsePriceOracleDatum(getInlineDatumOrThrow(orefs.priceOracleUtxo)).price,
      orefs.iasset.datum.debtMintingFeePercentage,
      orefs.iasset.datum.redemptionReimbursementPercentage,
      sysParams.lrpParams,
      allLrps.map((lrps) => [lrps.utxo, lrps.datum]),
    );

    await runAndAwaitTx(
      context.lucid,
      redeemLrpWithCdpOpen(
        maxLeverage,
        baseCollateral,
        targetCollateralRatioPercentage,
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
      { max: 1.200000003, min: 1.2 },
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
      { max: 156, min: 155 },
    );

    {
      const lrps = await findAllLrps(context.lucid, sysParams, iasset);
      expect(
        lrps.every((lrp) => hadLrpRedemption(lrp, sysParams.lrpParams)),
      ).toBeTruthy();
    }
  });
});
