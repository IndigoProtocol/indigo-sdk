import { Data } from '@lucid-evolution/lucid';

export const OneShotParamsSchema = Data.Object({
  referenceOutRef: Data.Object({
    txHash: Data.Bytes(),
    outputIdx: Data.Integer(),
  }),
  mintAmounts: Data.Array(
    Data.Object({
      /// Use hex encoded string
      tokenName: Data.Bytes(),
      amount: Data.Integer(),
    }),
  ),
});

export type OneShotParams = Data.Static<typeof OneShotParamsSchema>;
const OneShotParams = OneShotParamsSchema as unknown as OneShotParams;

export function castOneShotParams(params: OneShotParams): Data {
  return Data.castTo(params, OneShotParams);
}
