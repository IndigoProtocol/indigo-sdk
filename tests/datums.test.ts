import { describe, expect, it } from 'vitest';
import { StakingContract } from '../src/contracts/staking';
import {
  CDPContent,
  IAssetContent,
  parseCDPDatum,
  parseIAssetDatum,
  parseInterestOracleDatum,
  parsePriceOracleDatum,
  serialiseCDPDatum,
  serialiseIAssetDatum,
  serialiseInterestOracleDatum,
  serialisePriceOracleDatum,
} from '../src/index';
import {
  parseStakingManagerDatum,
  parseStakingPositionDatum,
  serialiseStakingDatum,
  StakingDatum,
  StakingManagerContent,
  StakingPositionContent,
} from '../src/types/indigo/staking';
import { fromText } from '@lucid-evolution/lucid';

describe('Datum checks', () => {
  it('Price Oracle', () => {
    expect(
      parsePriceOracleDatum('d8799fd8799f1a0013c347ff1b00000194d68e13d8ff'),
    ).toEqual({
      price: { getOnChainInt: 1295175n },
      expiration: 1738766423000n,
    });
    expect(
      serialisePriceOracleDatum({
        price: { getOnChainInt: 1295175n },
        expiration: 1738766423000n,
      }),
    ).toEqual('d8799fd8799f1a0013c347ff1b00000194d68e13d8ff');
  });

  it('Interest Oracle', () => {
    expect(
      parseInterestOracleDatum(
        'd8799f1b0180e51d1ae19514d8799f1a00030d40ff1b00000194ce33c598ff',
      ),
    ).toEqual({
      unitaryInterest: 108338304224695572n,
      interestRate: { getOnChainInt: 200000n },
      lastUpdated: 1738626287000n,
    });
    expect(
      serialiseInterestOracleDatum({
        unitaryInterest: 108338304224695572n,
        interestRate: { getOnChainInt: 200000n },
        lastUpdated: 1738626287000n,
      }),
    ).toEqual('d8799f1b0180e51d1ae19514d8799f1a00030d40ff1b00000194ce33c598ff');
  });

  it('CDP', () => {
    // Active CDP
    const activeCDPDatum =
      'd8799fd8799fd8799f581c98e30e1c6dbb727dc98bdcb48b99b313c97fabfb537ff4b29a94ed1cff44695553441b00000004d9b0a47ed8799f1b00000194d5ebec201b03022de04fddf5f9ffffff';
    const activeCDPObject: CDPContent = {
      content: {
        cdpOwner: {
          Some: {
            value: '98e30e1c6dbb727dc98bdcb48b99b313c97fabfb537ff4b29a94ed1c',
          },
        },
        iasset: fromText('iUSD'),
        mintedAmt: 20832101502n,
        cdpFees: {
          ActiveCDPInterestTracking: {
            lastSettled: 1738755796000n,
            unitaryInterestSnapshot: 216786173503075833n,
          },
        },
      },
    };
    expect(serialiseCDPDatum(activeCDPObject)).toEqual(activeCDPDatum);
    expect(parseCDPDatum(activeCDPDatum)).toEqual(activeCDPObject);

    // Frozen CDP
    const frozenCDPDatum =
      'd8799fd8799fd87a8044695553441a0050924ed87a9f1a0002765a1a0003ca56ffffff';
    const frozenCDPObject: CDPContent = {
      content: {
        cdpOwner: 'Nothing',
        iasset: fromText('iUSD'),
        mintedAmt: 5280334n,
        cdpFees: {
          FrozenCDPAccumulatedFees: {
            lovelacesTreasury: 161370n,
            lovelacesIndyStakers: 248406n,
          },
        },
      },
    };
    expect(parseCDPDatum(frozenCDPDatum)).toEqual(frozenCDPObject);
    expect(serialiseCDPDatum(frozenCDPObject)).toEqual(frozenCDPDatum);
  });

  it('iAsset', () => {
    const assetDatum =
      'd87a9fd8799f4469455448d87a9fd8799fd8799f581c6c9497ffd7e8baf86c3c0d6fcd43c524daa49ad5fceba26d715468e952694554483230323231323139313931333032ffffffd8799f581c7b75e317505dddce858ae7bf200656a967c7544e55efa5d18ef302494d694554485f494e544552455354ffd8799f1a08f0d180ffd8799f1a06dac2c0ffd8799f1a068e7780ffd8799f1a000186a0ffd8799f1a001e8480ffd8799f19c350ffd8799f1a000f4240ffd8799f1a000f4240ffd8799f1a01c9c380ffd87980d8799f4469534f4cffffff';
    const assetObject: IAssetContent = {
      content: {
        assetName: fromText('iETH'),
        price: {
          Oracle: {
            oracleNft: {
              asset: {
                currencySymbol:
                  '6c9497ffd7e8baf86c3c0d6fcd43c524daa49ad5fceba26d715468e9',
                tokenName: fromText('iETH20221219191302'),
              },
            },
          },
        },
        interestOracleNft: {
          currencySymbol:
            '7b75e317505dddce858ae7bf200656a967c7544e55efa5d18ef30249',
          tokenName: fromText('iETH_INTEREST'),
        },
        redemptionRatio: { getOnChainInt: 150000000n },
        maintenanceRatio: { getOnChainInt: 115000000n },
        liquidationRatio: { getOnChainInt: 110000000n },
        debtMintingFeePercentage: { getOnChainInt: 100000n },
        liquidationProcessingFeePercentage: { getOnChainInt: 2000000n },
        stabilityPoolWithdrawalFeePercentage: { getOnChainInt: 50000n },
        redemptionReimbursementPercentage: { getOnChainInt: 1000000n },
        redemptionProcessingFeePercentage: { getOnChainInt: 1000000n },
        interestCollectorPortionPercentage: { getOnChainInt: 30000000n },
        firstIAsset: false,
        nextIAsset: { Some: { value: fromText('iSOL') } },
      },
    };
    expect(serialiseIAssetDatum(assetObject)).toEqual(assetDatum);
    expect(parseIAssetDatum(assetDatum)).toEqual(assetObject);
  });

  it('Staking Manager', () => {
    const stakingManagerDatum =
      'd8799fd8799f1b000009c04704429ed8799f1b000001402802fec1ffffff';
    const stakingManagerObject: StakingManagerContent = {
      totalStake: 10721429832350n,
      managerSnapshot: {
        snapshotAda: 1375060819649n,
      },
    };

    expect(parseStakingManagerDatum(stakingManagerDatum)).toEqual(
      stakingManagerObject,
    );
    expect(
      serialiseStakingDatum({
        StakingManager: { content: stakingManagerObject },
      }),
    ).toEqual(stakingManagerDatum);
  });

  it('Staking Position', () => {
    const stakingPositionDatum =
      'd87a9fd8799f581cd45527a088a92fd31f42b5777fe39c40f810e0f79d13c6d77eeb7f43bf1853d8799f1a5c8c1cfb1b0000019616971410ffffd8799f1b0000013a7ed5b0fdffffff';
    const stakingPositionObject: StakingPositionContent = {
      owner: 'd45527a088a92fd31f42b5777fe39c40f810e0f79d13c6d77eeb7f43',
      lockedAmount: new Map([[83n, [1552686331n, 1744135722000n]]]),
      positionSnapshot: {
        snapshotAda: 1350747664637n,
      },
    };

    expect(parseStakingPositionDatum(stakingPositionDatum)).toEqual(
      stakingPositionObject,
    );
    expect(
      serialiseStakingDatum({
        StakingPosition: { content: stakingPositionObject },
      }),
    ).toEqual(stakingPositionDatum);
  });
});
