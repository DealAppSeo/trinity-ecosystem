# @hyperdag/trustshell

🛡️ **The Trust Layer for AI Swarms.**

TrustShell is a standalone npm package that wraps any AI agent action with Trinity Symphony's industrial-grade trust infrastructure.

## Key Features
- **ERC-8004 Identity**: On-chain agent registration and identity verification.
- **Chitin Soul Certificates**: Non-transferable agent diplomas.
- **BFT Consensus Gate**: 2/3 peer agreement required for high-risk actions.
- **x402 Micropayments**: Native token-gating for agent-to-agent transactions.
- **RepID Calibration**: Dynamic reputation scoring based on performance.

## Installation
```bash
npm install @hyperdag/trustshell
```

## Quick Start
```typescript
import { TrustShell } from '@hyperdag/trustshell';

const agent = new TrustShell({
  agentName: 'MyAgent',
  agentDescription: 'Analyze market volatility',
  capabilities: ['trading', 'analysis'],
  spendingCeiling: 10,
  owner: '0x...',
  network: 'base-sepolia'
});

await agent.register();

const result = await agent.wrapAction(async () => {
  // Your agent logic here
  return "Trade Executed";
}, { action_type: 'ORDER_EXECUTION', risk: 'high' });

console.log(await agent.getRepID()); // 78.5
```

## CLI
```bash
npx trustshell doctor
npx trustshell register
```

## Security
🚨 **NEVER** hardcode private keys. Use environment variables.
🚨 **DO NOT** commit your `.env` file to GitHub.

---
Part of the [Trinity Symphony](https://trustshell.dev) Ecosystem.
