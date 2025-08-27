# Indigo SDK

** Not ready for production yet **

`indigo-sdk` is a TypeScript SDK designed to interact with Indigo endpoints for managing CDPs (Collateralized Debt Positions), Staking Positions, and Stability Pool Accounts by integrating the [lucid-evolution](https://github.com/Anastasia-Labs/lucid-evolution) library.

## Installation

```bash
npm install @indigo-labs/indigo-sdk
```

## Development

### Prerequisites

- Node.js (version specified in `.nvmrc`)
- pnpm package manager

### Setup

1. Clone this repository
2. Install dependencies: `pnpm install`
3. Build the project: `pnpm run build`

### Available Scripts

- `pnpm run build` - Build the project using tsup
- `pnpm run lint` - Run ESLint to check code quality
- `pnpm run format` - Format code using Prettier
- `pnpm run format:check` - Check if code is properly formatted
- `pnpm run test` - Run tests using Vitest

### Code Quality

This project uses:

- **ESLint** for code linting and quality checks
- **Prettier** for code formatting
- **TypeScript** for type safety

### Running Tests

There are currently a few unit tests available for datums, hash checks, and interest calculations. Additionally, acceptance tests have been published for CDPs, Staking Positions, and Stability Pool accounts. These tests initialize the Indigo Protocol and positively test that the transaction building is working in an emulated Cardano Blockchain.

Instructions:

1. Clone this repository
2. Run `pnpm install`
3. Run `pnpm run test`

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
