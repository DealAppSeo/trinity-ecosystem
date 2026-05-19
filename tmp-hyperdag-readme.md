# HyperDAG Protocol
> Trust Infrastructure for the Agentic Economy

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Base Sepolia](https://img.shields.io/badge/Chain-Base_Sepolia-blue)](https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e)
[![ERC-8004](https://img.shields.io/badge/Standard-ERC--8004-purple)](https://eips.ethereum.org/EIPS/eip-8004)

## Live Demo

[trusttrader.dev](https://trusttrader.dev) -- Constitutional AI trading agent.
160+ trades refused. 0% drawdown. Every refusal proven on Base Sepolia.

**Verified transaction:** [0x806261...](https://sepolia.basescan.org/tx/0x806261e09c9e5526b7feb280ec29e2aa42ee89de47998895053e1c451a3649f5)

**Live endpoints:**
- [Agent Card (A2A + ERC-8004)](https://qnnpjhlxljtqyigedwkb.supabase.co/functions/v1/agent-card)
- [ZKP Postcard Proof](https://qnnpjhlxljtqyigedwkb.supabase.co/functions/v1/zkp-repid-proof?agent_id=3747&threshold=5000)
- [x402 Gate](https://qnnpjhlxljtqyigedwkb.supabase.co/functions/v1/x402-gate?agent_id=3747)
- [Compliance Report](https://qnnpjhlxljtqyigedwkb.supabase.co/functions/v1/generate-compliance-report)

---

## HyperDAG Trust Protocol v1

The application layer that makes **ERC-8004 identity useful** and **x402 payments safe**.

### The Problem

AI agents can trade, sign, and pay -- but counterparties have no way to verify an agent's standing before transacting. ERC-8004 provides identity. x402 provides payment. But there is no **trust gate** between them.

### The Three-Layer Model

**Postcard (Tier 1)** -- Sub-second ZKP verification.
Proves "this agent has RepID above threshold, backed by a human Conservator" without revealing the score or identity. Used by x402 before any payment flows. Currently SHA-256 commitment proof-of-concept; Plonky3 range-check (BabyBear field) in development.

**Envelope (Tier 2)** -- Verified data exchange.
JWT-gated packet containing constitutional decision history, trade parameters, and conservatorship details. Opened by trading counterparties before significant transactions. Gated by RepID >= 500.

**Package (Tier 3)** -- Sovereign encrypted data.
Full history -- tax records, KYA, financial logs -- encrypted with Shamir M-of-N. Only the SBT holder and designated Conservators can open it. Stored on IPFS/Filecoin/Arweave. v1 roadmap.

### How It Integrates with ERC-8004 + x402

1. Agent presents Postcard ZKP -> counterparty verifies standing in <1s
2. x402 challenge includes RepID requirement -> agent proves threshold met
3. Trade executes -> ERC-8004 Validation Registry records outcome
4. x402 micropayment flows to signal providers
5. RepID updates -> next Postcard reflects new standing

ERC-8004 provides **identity + immutable proof registry**.
x402 provides **HTTP-native micropayments**.
ZKP RepID provides **the trust gate between them**.

### Constitutional Trading -- The Core Innovation

Most trading bots maximize returns. TrustTrader maximizes **constitutional compliance**.

13 market signals mapped to the **Circle of Fifths**. When collective dissonance exceeds the **Pythagorean Comma threshold** (531441/524288 = 1.013643), the agent issues a **Constitutional Refusal** -- signed with EIP-712, dual-validated by SOPHIA + VERITAS, and proved on the ERC-8004 Validation Registry.

**Unity Score** = (Logic x Chaos x Beauty)^(1/phi) where phi = 1.618

Execute **only** when Unity > 0.95. The trades the agent **refuses** to make are the product.

### RepID as Insurance

High-RepID Conservators stake reputation to back agents. Optional financial staking (USDC) creates coverage pools.

| Metric | Value |
|--------|-------|
| SOPHIA RepID | 7,800+ |
| Conservator coverage | $250 |
| ERC-8004 token | #3747 |
| Decisions made | 160+ |
| Constitutional refusals | 155+ |
| Max drawdown | 0% |

### Registered Agents (Base Sepolia)

| Agent | Token ID | RepID | Role |
|-------|----------|-------|------|
| **SOPHIA** | [3747](https://sepolia.basescan.org/tx/0x5abc007b8e400dc1cee787a6e5ab356126d8cb345dab5e1289e47be06561961f) | 7,800+ | Constitutional trading |
| **NEXUS** | [3748](https://sepolia.basescan.org/tx/0xf0763a657fbbcd7f7beaadbb585e1121996247c54a4d8ff0c5a4506bc437df3c) | 2,100 | Risk analysis |
| **ATLAS** | [3749](https://sepolia.basescan.org/tx/0xbca05ff1f59fc85303dd1d8d4fd6daf7f1d862ef0f4ca372f6106fff52a6ffa9) | 1,800 | Signal processing |
| **GUARDIAN** | [3750](https://sepolia.basescan.org/tx/0x5ce0f4ab37ac43a70016e18ab81253635eaafde23ecbe94aeed7ad63385abc3b) | 1,400 | Compliance |

### On-Chain Infrastructure

| Contract | Address | Chain |
|----------|---------|-------|
| Identity Registry | 0x8004A818BFB912233c491871b3d84c89A494BD9e | Base Sepolia |
| Validation Registry | 0x8004Cb1BF31DAf7788923b405b754f57acEB4272 | Base Sepolia |
| Reputation Registry | 0x8004B663056A597Dffe9eCcC1965A193B7388713 | Base Sepolia |

### Technical Stack

- **Identity**: ERC-8004 Identity/Validation/Reputation Registries on Base Sepolia
- **ZKP**: SHA-256 commitment PoC (Plonky3 BabyBear range-check in development)
- **Payments**: x402 HTTP 402 payment gating per coinbase/x402 spec
- **Discovery**: A2A agent card per a2aproject/A2A spec
- **Trading**: Kraken CLI paper trading, 13 signals on Circle of Fifths
- **Veto**: Pythagorean Comma BFT (531441/524288 threshold)
- **Agents**: Trinity Symphony 12-agent constitutional swarm on Railway
- **Data**: Supabase (PostgreSQL 17), pg_cron, Edge Functions

## Public Repositories

| Repo | Purpose |
|------|---------|
| [hyperdag-protocol](https://github.com/DealAppSeo/hyperdag-protocol) | Protocol specification |
| [trinity-ecosystem](https://github.com/DealAppSeo/trinity-ecosystem) | Backend services, agent pipeline |
| [trinity-symphony-shared](https://github.com/DealAppSeo/trinity-symphony-shared) | 12-agent constitutional swarm |
| [trustrails-dev](https://github.com/DealAppSeo/trustrails-dev) | Frontend terminal UI |

## License

Apache 2.0

---

*Patent Portfolio Pending P-001-P-028*

*"Act justly. Love mercy. Walk humbly." -- Micah 6:8*

*Built for the [LabLab AI Trading Agents Hackathon](https://lablab.ai) -- April 2026*

2026-05-19: Updated agent roster — RAVEN -> NEXUS (legacy doc reference correction; NEXUS is production canonical)
