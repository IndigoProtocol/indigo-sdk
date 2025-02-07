import { Constr, Data } from '@lucid-evolution/lucid';
import { GovDatum } from '../types/indigo/gov';

export class GovContract {
  static decodeGovDatum(datum: string): GovDatum {
    const d = Data.from(datum) as any;
    if (
      d.index !== 0 ||
      d.fields.length !== 6 ||
      d.fields[1].fields.length !== 10
    )
      throw 'Invalid GovDatum found';

    return {
      currentProposal: d.fields[0],
      protocolParams: {
        proposalDeposit: d.fields[1].fields[0],
        votingPeriod: d.fields[1].fields[1],
        effectiveDelay: d.fields[1].fields[2],
        expirationPeriod: d.fields[1].fields[3],
        collateralFeePercentage: d.fields[1].fields[4].fields[0],
        proposingPeriod: d.fields[1].fields[5],
        totalShards: d.fields[1].fields[6],
        minimumQuorum: d.fields[1].fields[7],
        maxTreasuryLovelaceSpend: d.fields[1].fields[8],
        maxTreasuryIndySpend: d.fields[1].fields[9],
      },
      currentVersion: d.fields[2],
      iassetsCount: d.fields[3],
      activeProposals: d.fields[4],
      treasuryIndyWithdrawnAmt: d.fields[5],
    };
  }

  static encodeGovDatum(datum: GovDatum): string {
    return Data.to(
      new Constr(0, [
        datum.currentProposal,
        new Constr(0, [
          datum.protocolParams.proposalDeposit,
          datum.protocolParams.votingPeriod,
          datum.protocolParams.effectiveDelay,
          datum.protocolParams.expirationPeriod,
          new Constr(0, [datum.protocolParams.collateralFeePercentage]),
          datum.protocolParams.proposingPeriod,
          datum.protocolParams.totalShards,
          datum.protocolParams.minimumQuorum,
          datum.protocolParams.maxTreasuryLovelaceSpend,
          datum.protocolParams.maxTreasuryIndySpend,
        ]),
        datum.currentVersion,
        datum.iassetsCount,
        datum.activeProposals,
        datum.treasuryIndyWithdrawnAmt,
      ]),
    );
  }
}
