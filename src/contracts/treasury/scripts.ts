import {
  applyParamsToScript,
  Constr,
  fromText,
  SpendingValidator,
} from '@lucid-evolution/lucid';
import { TreasuryParamsSP } from '../../types/system-params';
import { _treasuryValidator } from '../../validators/treasury-validator';

export const mkTreasuryValidatorFromSP = (
  params: TreasuryParamsSP,
): SpendingValidator => {
  return {
    type: 'PlutusV3',
    script: applyParamsToScript(_treasuryValidator.cborHex, [
      new Constr(0, [
        new Constr(0, [
          params.upgradeToken[0].unCurrencySymbol,
          fromText(params.upgradeToken[1].unTokenName),
        ]),
        new Constr(0, [
          params.versionRecordToken[0].unCurrencySymbol,
          fromText(params.versionRecordToken[1].unTokenName),
        ]),
        params.treasuryUtxosStakeCredential
          ? new Constr(0, [
              new Constr(0, [
                new Constr(1, [
                  params.treasuryUtxosStakeCredential.contents.contents,
                ]),
              ]),
            ])
          : new Constr(1, []),
      ]),
    ]),
  };
};
