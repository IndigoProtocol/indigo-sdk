import { Constr, Data, fromText, toText } from '@lucid-evolution/lucid';
import { StabilityPoolDatum, StabilityPoolDatumSchema } from '../types/indigo/stability-pool';

export class StabilityPoolContract {
  static decodeDatum(datum: string): StabilityPoolDatum {
    return Data.from(datum, StabilityPoolDatum);
  }

  static encodeDatum(datum: StabilityPoolDatum): string {
    return Data.to(datum, StabilityPoolDatum);
  }
}
