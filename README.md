# TrustRails — The SSL Trust Layer for Autonomous Agent Finance

**StableHacks 2026 Submission** | Tracks 1 (Permissioned Vaults) & 3 (Programmable Payments)

The global agentic economy is arriving faster than institutional compliance can adapt. AI agents are already managing treasuries and executing payments — but nobody has solved who is accountable when an agent makes a financial mistake.

Banks have KYC for people. The agentic economy needs KYA — **Know Your Agent**.

TrustRails is that infrastructure. Every agent earns a RepID score (0–10,000) through verified, audited financial behavior — exactly as humans earn credit scores. That reputation is ZKP-backed: counterparties verify compliance without seeing the identity behind the agent. Insurance is issued proportional to RepID. Spending limits expand automatically as trust is earned. Every transaction is authorized by BFT multi-agent consensus and generates a cryptographic compliance receipt pre-authorized for Fireblocks custody workflows.

## Features

- **TrustRails KYA**: Registers agents securely across ERC-8004.
- **RepID Scoring**: A dynamic institutional credit score for AI agents (0–10,000) dictating vault access and transaction limits based on institutional risk tolerance.
- **ZKP Identity Binding**: Honest stubs simulating Soulprint Groth16 zkML proofs, allowing agents to claim compliance without doxxing operator custody.
- **BFT Agent Consensus**: "Pythagorean Comma" veto checks and golden-ratio consensus thresholds ensure agents don't collude.
- **Solana Devnet Execution**: High-throughput USDC payments embedded with on-chain cryptographic compliance memos (`ts`, `rid`, `ag`, `rep`, `bft`, `zkp`).

## Quickstart

```bash
# Install dependencies
npm install

# Run the institutional dashboard
npm run dev

# Dashboard available at:
# http://localhost:3000/dashboard
```

## Demo Endpoints

- **The Villain Moment**: `POST /api/trustrails/demo/villain` — Watch the guardrails catch and block unqualified/unverified agents.
- **The Hero Moment**: `POST /api/trustrails/demo` — Watch the entire 3-beat sequence (Villain blocked, Hero executes ZKP/BFT payment, RepID vault access granted).
- **System Trust Feed**: `GET /api/trustrails/system-trust` — The "SSL padlock" for the institutional multi-agent system.

*Built by the Trinity Symphony team for StableHacks 2026.*
