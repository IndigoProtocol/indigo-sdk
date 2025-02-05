# Indigo SDK

`indigo-sdk` is a TypeScript SDK designed to interact with Indigo endpoints for managing CDPs (Collateralized Debt Positions) by integrating the [lucid-evolution](https://github.com/Anastasia-Labs/lucid-evolution) library.

## Endpoints

- **Open CDP**
- **Close CDP**
- **Deposit Collateral to CDP**
- **Withdraw Collateral from CDP**
- **Mint against CDP**
- **Burn against CDP**
- **Pay CDP Interest**

## Installation

```bash
npm install indigo-sdk
```

## Usage

```typescript
import {
  openCdp,
  closeCdp,
  depositCollateral,
  withdrawCollateral,
  mintAgainstCdp,
  burnAgainstCdp,
  payCdpInterest
} from 'indigo-sdk';

async function run() {
  const openResponse = await openCdp({
    collateralAmount: 100,
    debtAmount: 50,
    accountId: 'your-account-id'
  });
  
  if (openResponse.success) {
    console.log('CDP opened:', openResponse.data);
  } else {
    console.error('Error opening CDP:', openResponse.error);
  }
}

run();
```

## Development

### Build 
```bash
npm run build
```
### Test 
```bash
npm run test
```