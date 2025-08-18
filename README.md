# Indigo SDK

** Not ready for production yet **

`indigo-sdk` is a TypeScript SDK designed to interact with Indigo endpoints for managing CDPs (Collateralized Debt Positions), Staking Positions, and Stability Pool Accounts by integrating the [lucid-evolution](https://github.com/Anastasia-Labs/lucid-evolution) library.

## Installation

```bash
npm install @indigo-labs/indigo-sdk
```

## Running Tests

There are currently a few unit tests available for datums, hash checks, and interest calculations. Additionally, acceptance tests have been published for CDPs, Staking Positions, and Stability Pool accounts. These tests initialize the Indigo Protocol and positively test that the transaction building is working in an emulated Cardano Blockchain.

Instructions:
1. Clone this repository
2. Run `npm install`
3. Run `npm run test`

## Endpoints

- **Open CDP**
- **Close CDP**
- **Deposit Collateral to CDP**
- **Withdraw Collateral from CDP**
- **Mint against CDP**
- **Burn against CDP**
- **Pay CDP Interest**
- **Open a Staking Position**
- **Adjust a Staking Position**
- **Close a Staking Position**
- **Open a Stability Pool Account**
- **Adjust a Stability Pool Account**
- **Close a Stability Pool Account**
