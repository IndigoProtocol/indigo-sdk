import { describe, expect, it } from 'vitest';
import {
  CDPContent,
  IAssetContent,
  parseCDPDatum,
  parseIAssetDatumOrThrow,
  parseInterestOracleDatum,
  parsePriceOracleDatum,
  parseStabilityPoolDatum,
  serialiseCDPDatum,
  serialiseFeedInterestOracleRedeemer,
  serialiseIAssetDatum,
  serialiseInterestOracleDatum,
  serialisePriceOracleDatum,
  serialiseStabilityPoolDatum,
  StabilityPoolContent,
} from '../src/index';
import { fromText } from '@lucid-evolution/lucid';
import {
  parseStakingManagerDatum,
  parseStakingPositionOrThrow,
  serialiseStakingDatum,
  StakingManager,
  StakingPosition,
} from '../src/types/indigo/staking-new';

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

  it('Interest Oracle Redeemer', () => {
    expect(
      serialiseFeedInterestOracleRedeemer({
        newInterestRate: { getOnChainInt: 1_000_000n },
        currentTime: 1724851200n,
      }),
    ).toEqual('d8799fd8799f1a000f4240ff1a66cf2400ff');
  });

  it('CDP', () => {
    // Active CDP
    const activeCDPDatum =
      'd8799fd8799fd8799f581c98e30e1c6dbb727dc98bdcb48b99b313c97fabfb537ff4b29a94ed1cff44695553441b00000004d9b0a47ed8799f1b00000194d5ebec201b03022de04fddf5f9ffffff';
    const activeCDPObject: CDPContent = {
      cdpOwner: '98e30e1c6dbb727dc98bdcb48b99b313c97fabfb537ff4b29a94ed1c',
      iasset: fromText('iUSD'),
      mintedAmt: 20832101502n,
      cdpFees: {
        ActiveCDPInterestTracking: {
          lastSettled: 1738755796000n,
          unitaryInterestSnapshot: 216786173503075833n,
        },
      },
    };
    expect(serialiseCDPDatum(activeCDPObject)).toEqual(activeCDPDatum);
    expect(parseCDPDatum(activeCDPDatum)).toEqual(activeCDPObject);

    // Frozen CDP
    const frozenCDPDatum =
      'd8799fd8799fd87a8044695553441a0050924ed87a9f1a0002765a1a0003ca56ffffff';
    const frozenCDPObject: CDPContent = {
      cdpOwner: null,
      iasset: fromText('iUSD'),
      mintedAmt: 5280334n,
      cdpFees: {
        FrozenCDPAccumulatedFees: {
          lovelacesTreasury: 161370n,
          lovelacesIndyStakers: 248406n,
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
      assetName: fromText('iETH'),
      price: {
        Oracle: {
          content: {
            oracleNft: {
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
      nextIAsset: fromText('iSOL'),
    };
    expect(serialiseIAssetDatum(assetObject)).toEqual(assetDatum);
    expect(parseIAssetDatumOrThrow(assetDatum)).toEqual(assetObject);
  });

  it('Staking Manager', () => {
    const stakingManagerDatum =
      'd8799fd8799f1b000009c04704429ed8799f1b000001402802fec1ffffff';
    const stakingManagerObject: StakingManager = {
      totalStake: 10721429832350n,
      managerSnapshot: {
        snapshotAda: 1375060819649n,
      },
    };

    expect(parseStakingManagerDatum(stakingManagerDatum)).toEqual(
      stakingManagerObject,
    );
    expect(serialiseStakingDatum(stakingManagerObject)).toEqual(
      stakingManagerDatum,
    );
  });

  it('Staking Position', () => {
    const stakingPositionDatum =
      'd87a9fd8799f581cd45527a088a92fd31f42b5777fe39c40f810e0f79d13c6d77eeb7f43a11853d8799f1a5c8c1cfb1b0000019616971410ffd8799f1b0000013a7ed5b0fdffffff';
    const stakingPositionObject: StakingPosition = {
      owner: 'd45527a088a92fd31f42b5777fe39c40f810e0f79d13c6d77eeb7f43',
      lockedAmount: new Map([
        [83n, { voteAmt: 1552686331n, votingEnd: 1744135722000n }],
      ]),
      positionSnapshot: {
        snapshotAda: 1350747664637n,
      },
    };

    expect(parseStakingPositionOrThrow(stakingPositionDatum)).toEqual(
      stakingPositionObject,
    );
    expect(serialiseStakingDatum(stakingPositionObject)).toEqual(
      stakingPositionDatum,
    );
  });

  it('Stability Pool', () => {
    const stabilityPoolDatum =
      'd8799fd8799f4469555344d8799fd8799f1b0a37ad5c452ffb2affd8799fc24d1f94ac680ce6b48ea21bb122baffd8799f1b0fde3bba456cd5deff0100ffa2d8799f0000ffd8799f1b084494e2d23b2b7effd8799f0100ffd8799f1b0fde3bba456cd5deffffff';
    const stabilityPoolObject: StabilityPoolContent = {
      asset: fromText('iUSD'),
      snapshot: {
        productVal: { value: 736247675907734314n },
        depositVal: { value: 2502085246000826468068228145850n },
        sumVal: { value: 1143417026613401054n },
        epoch: 1n,
        scale: 0n,
      },
      epochToScaleToSum: new Map([
        [{ epoch: 0n, scale: 0n }, { value: 595764752630360958n }],
        [{ epoch: 1n, scale: 0n }, { value: 1143417026613401054n }],
      ]),
    };
    expect(parseStabilityPoolDatum(stabilityPoolDatum)).toEqual(
      stabilityPoolObject,
    );
    expect(
      serialiseStabilityPoolDatum({
        StabilityPool: { content: stabilityPoolObject },
      }),
    ).toEqual(stabilityPoolDatum);
  });

  // it('Stability Pool Account', () => {
  //   const stabilityPoolDatum =
  //     'd87a9fd8799f581c12c646d4c6d7a35c14788d15f0f6142f6148975d8932592fbd625f674469555344d8799fd8799f1b0a37ad5c452ffb2affd8799fc24c39fa2838b1f7dd38267f0a6dffd8799f1b0fde3b75c28ab489ff0100ffd87a80ffff';
  //   const stabilityPoolObject: AccountContent = {
  //       owner: '12c646d4c6d7a35c14788d15f0f6142f6148975d8932592fbd625f67',
  //       asset: fromText('iUSD'),
  //       snapshot: {
  //         productVal: { value: 736247675907734314n },
  //         depositVal: { value: 17943066955221270821727046253n },
  //         sumVal: { value: 1143416732359767177n },
  //         epoch: 1n,
  //         scale: 0n,
  //       },
  //       request: null,
  //   };

  //   expect(parseAccountDatum(stabilityPoolDatum)).toEqual(stabilityPoolObject);
  //   expect(
  //     serialiseStabilityPoolDatum({ Account: { content: stabilityPoolObject } }),
  //   ).toEqual(stabilityPoolDatum);
  // });

  // it('Stability Pool Account w/ Adjust Request', () => {
  //   const stabilityPoolDatum =
  //     'd87a9fd8799f581c90e40129516ee738fa6aa9183cf57b45c46946496e1590d34ca1b15c4469555344d8799fd8799f1b0a374472be304a62ffd8799fc24b01aef07f96e5ce00f80000ffd8799f1b0f88aa07a1048079ff0100ffd8799fd87a9f3a0007c359d8799fd8799f581c90e40129516ee738fa6aa9183cf57b45c46946496e1590d34ca1b15cffd8799fd8799fd8799f581c75a4f9204b9308a92a09b0e22b94125e56f24b73bb85e2795f176c6affffffffffffffff';
  //   const stabilityPoolObject: AccountContent = {
  //       owner: '90e40129516ee738fa6aa9183cf57b45c46946496e1590d34ca1b15c',
  //       asset: fromText('iUSD'),
  //       snapshot: {
  //         productVal: { value: 736132323706161762n },
  //         depositVal: { value: 2035054000000000000000000n },
  //         sumVal: { value: 1119331457144488057n },
  //         epoch: 1n,
  //         scale: 0n,
  //       },
  //       request: {
  //         Adjust: {
  //           amount: -508762n,
  //           outputAddress: {
  //             paymentCredential: {
  //               PublicKeyCredential: ['90e40129516ee738fa6aa9183cf57b45c46946496e1590d34ca1b15c'],
  //             },
  //             stakeCredential: {
  //               Inline: [{PublicKeyCredential: ['75a4f9204b9308a92a09b0e22b94125e56f24b73bb85e2795f176c6a']}],
  //             },
  //           },
  //         },
  //       },
  //   };

  //   expect(parseAccountDatum(stabilityPoolDatum)).toEqual(stabilityPoolObject);
  //   expect(
  //     serialiseStabilityPoolDatum({ Account: { content: stabilityPoolObject } }),
  //   ).toEqual(stabilityPoolDatum);
  // });

  // it('Stability Pool SnapshotEpochToScaleToSum', () => {
  //   const stabilityPoolDatum =
  //     'd87b9fd8799f4469555344bfd8799f0000ffd8799f1b084494e2d23b2b7effd8799f0100ffd8799f1b0fde3bba456cd5deffffffff';
  //   const stabilityPoolObject: SnapshotEpochToScaleToSumContent = {
  //       asset: fromText('iUSD'),
  //       snapshot: new Map([
  //         [{ epoch: 0n, scale: 0n }, { sum: 595764752630360958n }],
  //         [{ epoch: 1n, scale: 0n }, { sum: 1143417026613401054n }],
  //       ]),
  //   };

  //   expect(parseSnapshotEpochToScaleToSumDatum(stabilityPoolDatum)).toEqual(stabilityPoolObject);
  //   expect(
  //     serialiseStabilityPoolDatum({
  //       SnapshotEpochToScaleToSum: { content: stabilityPoolObject },
  //     }),
  //   ).toEqual(stabilityPoolDatum);
  // });
});
