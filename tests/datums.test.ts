import { Data, fromText } from '@lucid-evolution/lucid';
import { PriceOracle, InterestOracle, CDP } from '../src/index';

describe('Datum checks', () => {
  it('Price Oracle', () => {
    expect(
      Data.from('d8799fd8799f1a0013c347ff1b00000194d68e13d8ff', PriceOracle),
    ).toEqual({ price: { value: 1295175n }, expiration: 1738766423000n });
    expect(
      Data.to(
        { price: { value: 1295175n }, expiration: 1738766423000n },
        PriceOracle,
      ),
    ).toEqual('d8799fd8799f1a0013c347ff1b00000194d68e13d8ff');
  });

  it('Interest Oracle', () => {
    expect(
      Data.from(
        'd8799f1b0180e51d1ae19514d8799f1a00030d40ff1b00000194ce33c598ff',
        InterestOracle,
      ),
    ).toEqual({
      unitaryInterest: 108338304224695572n,
      interestRate: { value: 200000n },
      lastUpdated: 1738626287000n,
    });
    expect(
      Data.to(
        {
          unitaryInterest: 108338304224695572n,
          interestRate: { value: 200000n },
          lastUpdated: 1738626287000n,
        },
        InterestOracle,
      ),
    ).toEqual('d8799f1b0180e51d1ae19514d8799f1a00030d40ff1b00000194ce33c598ff');
  });

  it('CDP', () => {
    // Active CDP
    const activeCDPDatum =
      'd8799fd8799fd8799f581c98e30e1c6dbb727dc98bdcb48b99b313c97fabfb537ff4b29a94ed1cff44695553441b00000004d9b0a47ed8799f1b00000194d5ebec201b03022de04fddf5f9ffffff';
    const activeCDPObject: CDP = {
      CDP: {
        data: {
          owner: '98e30e1c6dbb727dc98bdcb48b99b313c97fabfb537ff4b29a94ed1c',
          asset: fromText('iUSD'),
          mintedAmount: 20832101502n,
          fees: {
            ActiveCDPInterestTracking: {
              last_settled: 1738755796000n,
              unitary_interest_snapshot: 216786173503075833n,
            },
          },
        },
      },
    };
    expect(Data.from(activeCDPDatum, CDP)).toEqual(activeCDPObject);
    expect(Data.to(activeCDPObject, CDP)).toEqual(activeCDPDatum);

    // Frozen CDP
    const frozenCDPDatum =
      'd8799fd8799fd87a8044695553441a0050924ed87a9f1a0002765a1a0003ca56ffffff';
    const frozenCDPObject: CDP = {
      CDP: {
        data: {
          owner: null,
          asset: fromText('iUSD'),
          mintedAmount: 5280334n,
          fees: {
            FrozenCDPAccumulatedFees: {
              lovelaces_treasury: 161370n,
              lovelaces_indy_stakers: 248406n,
            },
          },
        },
      },
    };
    expect(Data.from(frozenCDPDatum, CDP)).toEqual(frozenCDPObject);
    expect(Data.to(frozenCDPObject, CDP)).toEqual(frozenCDPDatum);
  });

  it('iAsset', () => {
    const assetDatum =
      'd87a9fd8799f4469455448d87a9fd8799fd8799f581c6c9497ffd7e8baf86c3c0d6fcd43c524daa49ad5fceba26d715468e952694554483230323231323139313931333032ffffffd8799f581c7b75e317505dddce858ae7bf200656a967c7544e55efa5d18ef302494d694554485f494e544552455354ffd8799f1a08f0d180ffd8799f1a06dac2c0ffd8799f1a068e7780ffd8799f1a000186a0ffd8799f1a001e8480ffd8799f19c350ffd8799f1a000f4240ffd8799f1a000f4240ffd8799f1a01c9c380ffd87980d8799f4469534f4cffffff';
    const assetObject: CDP = {
      IAsset: {
        data: {
          name: fromText('iETH'),
          price: {
            Reference: {
              OracleAssetNft: {
                AssetClass: {
                  policy_id:
                    '6c9497ffd7e8baf86c3c0d6fcd43c524daa49ad5fceba26d715468e9',
                  asset_name: '694554483230323231323139313931333032',
                },
              },
            },
          },
          interestOracle: {
            policy_id:
              '7b75e317505dddce858ae7bf200656a967c7544e55efa5d18ef30249',
            asset_name: fromText('iETH_INTEREST'),
          },
          redemptionRatioPercentage: { value: 150000000n },
          maintenanceRatioPercentage: { value: 115000000n },
          liquidationRatioPercentage: { value: 110000000n },
          debtMintingFeePercentage: { value: 100000n },
          liquidationProcessingFeePercentage: { value: 2000000n },
          stabilityPoolWithdrawalFeePercentage: { value: 50000n },
          redemptionReimbursementPercentage: { value: 1000000n },
          redemptionProcessingFeePercentage: { value: 1000000n },
          interestCollectorPortionPercentage: { value: 30000000n },
          firstAsset: false,
          nextAsset: fromText('iSOL'),
        },
      },
    };
    // expect(Data.from(assetDatum, CDP)).toEqual(assetObject);
    expect(Data.to(assetObject, CDP)).toEqual(assetDatum);
  });
});
