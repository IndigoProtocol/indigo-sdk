declare global {
    interface BigInt {
        toJSON(): Number;
    }
}

BigInt.prototype.toJSON = function () { return this.toString() }

export * from './contracts/cdp-creator';
export * from './contracts/cdp';
export * from './contracts/collector';
export * from './contracts/gov';
export * from './contracts/interest-oracle';
export * from './contracts/price-oracle';
export * from './contracts/treasury';
export * from './helpers/asset-helpers';
export * from './helpers/cdp-helpers';
export * from './helpers/helpers';
export * from './helpers/lucid-utils';
export * from './helpers/time-helpers';
export * from './scripts/cdp-creator-validator';
export * from './scripts/cdp-validator';
export * from './scripts/collector-validator';
export * from './scripts/interest-oracle-validator';
export * from './scripts/treasury-validator';
export * from './types/indigo/cdp';
export * from './types/indigo/gov';
export * from './types/indigo/interest-oracle';
export * from './types/indigo/price-oracle';
export * from './types/generic';
export * from './types/system-params';