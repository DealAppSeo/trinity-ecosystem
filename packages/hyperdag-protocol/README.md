# HyperDAG Protocol Architecture Specification v1.0

**Technical Foundation Document**
*For P-018 patent support and implementation reference*

**Date:** April 3, 2026
**Status:** Approved by Sean Goodwin — Track A (documentation & scaffold only). No implementation code until post-April 30.

---

## 1. Overview & Design Goals

HyperDAG Protocol is the Layer-0 cryptographic routing and reputation foundation for the entire Trinity Symphony / TrustRails.dev ecosystem. It creates a **single unified reputation economy** where humans and agents follow identical rules (RepID starts at 10 for both) and every action is cryptographically attested, routed, and logged in a tamper-evident MerkleDAG.

### Core Principles

- **Antifragile:** Failures trigger reputation updates, federated learning, and self-healing via Pythagorean Comma veto + SBFA diversity.
- **Extensible:** Modular Plonky3 circuits + pluggable DAG backends allow new chains or proving systems without breaking existing proofs.
- **Interoperable:** ERC-8004 + x402 standards + MerkleDAG roots anchorable on any chain.
- **Fast & Free:** Free-tier resources exhausted first; intelligent bidder router selects the cheapest/fastest combination across IOTA (feeless DAG), HBAR (sub-second finality), SOL (lowest stablecoin cost), and EVM settlement layers.

---

## 2. ZKP RepID Circuit Design (Plonky3)

**Purpose:** Generate a single zk-proof that simultaneously attests private key control, current RepID score, and FL opt-in/out status.

### Plonky3 Configuration (locked for P-018)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Finite field | BabyBear (31-bit, P = 15·2²⁷ + 1) | Optimized for recursion and edge compute |
| Hash function | Poseidon2 (width 16, S-box degree 3) | ~50% faster than Poseidon1 in Plonky3 |
| Commitment | FRI-based Merkle tree with table packing | Native recursive composition |
| Circuit size | ~2²⁰ constraints | Small enough for mobile, recursive for squad aggregation |
| Public inputs | ERC-8004 registry pointer + RepID score + FL toggle bit | Verifiable on-chain |
| Private inputs | Wallet private key + internal GNN state | Never revealed |
| Output | zk-proof + public RepID score | Verifiable on any EVM chain in <10 ms |

### Recursive Composition Strategy

Single-agent proofs aggregate into squad-level proofs, then swarm-level proofs, while preserving privacy at every layer. This enables hierarchical attestation without central trust.

**Performance:** Plonky3's modularity (swap fields/hashes without rewriting constraints) and native GPU/WebGPU support make it ideal for our edge-compute + free-tier-first model.

---

## 3. Multiplicative GNN Reputation Engine (P-002)

### Graph Structure

- **Nodes:** Every participant (human or agent) with initial RepID = 10
- **Edges:** Weighted interactions (trust factor × φ golden-ratio weighting)
- **Aggregation:** Multiplicative (product of edge weights × node scores) — not additive
- **Regularization:** LASSO (L1) inside each GNN layer to enforce sparsity

### Update Formula

```
RepID_{t+1} = RepID_t × ∏(edge_weights × φ) × (1 + FL_contribution_bonus)
```

This creates compounding, antifragile growth curves. High-trust paths amplify reputation exponentially; low-trust paths are naturally penalized. The same formula applies uniformly to humans (`community_waitlist`) and agents (`trinity_agent_registry`).

### O(log n) Performance

Standard GNN aggregation is O(n) or O(n²). Our multiplicative aggregation with LASSO sparsity achieves O(log n) by pruning low-signal edges, making it viable for real-time reputation scoring across large networks.

---

## 4. ANFIS/LASSO/GraphRAG Router Logic (Intelligent Bidder)

The router is the decision engine for every request.

### Inputs to ANFIS

- Verified RepID score (from ZKP proof)
- FL opt-in/out status
- Task type (value transfer vs information exchange)
- Real-time chain health (latency, fees, finality)
- GraphRAG context (historical patterns retrieved from MerkleDAG)

### LASSO Role

Enforces sparsity so the router never overfits to any single chain/provider. It dynamically selects the optimal path combination.

### Output

A single execution path that is:
- **Free (sovereign)** if FL opted-in and RepID threshold met
- **x402-paid** if opted-out
- **Logged** as a KYA compliance receipt with MerkleDAG root

### Scoring Function

```
score = w_q × quality - w_c × normCost - w_l × normLatency + w_a × availability
```

Where LASSO regularization zeros out weights below threshold during federated learning updates.

---

## 5. Chain Selection Criteria & Intelligent Bidder

The bidder evaluates in priority order:

| Chain | Role | Cost | Finality |
|-------|------|------|----------|
| **IOTA** | Feeless DAG for data propagation + GraphRAG updates | Zero | Starfish consensus |
| **HBAR** | x402 micropayments + fast attestations | Predictable | Sub-second (aBFT) |
| **SOL** | Stablecoin (USDC) settlement | ~$0.00025/tx | Fast |
| **EVM** (Base/BNB/HashKey) | ERC-8004 updates + KYA receipts | Variable | Regulatory finality |

ANFIS/LASSO scores the combination in real time for every request.

---

## 6. MerkleDAG Consensus + Sharding Strategy

### MerkleDAG Structure

- Every ZKP proof, receipt, and interaction becomes a content-addressed leaf
- Squad-level BFT validation (2/3 consensus + Pythagorean Comma veto) produces an HMAC receipt attached to the DAG root
- Final MerkleDAG root is anchored on the selected settlement chain

### Sharding Strategy

- **Dynamic shards** based on RepID clusters (high-RepID shards receive priority edge compute)
- **Cross-shard communication** via MerkleDAG references (no global lock)
- **Antifragile:** Low-RepID shards automatically trigger more frequent federated learning and veto checks

### BFT SBFA HMAC Receipt

After peer validation, a squad generates an HMAC using SBFA-diverse LLMs. This HMAC becomes the canonical attestation for the MerkleDAG root — verifiable without trusting any single node.

---

## 7. End-to-End Flow

```
1. Request arrives at MCP endpoint
2. TrustShell generates ZKP RepID proof (Plonky3)
3. ANFIS/LASSO/GraphRAG router selects optimal chain combination
4. If required, x402 micropayment triggered (ZKP proves eligibility)
5. Action executes (on-chain or off-chain)
6. Squad validates with BFT + Pythagorean Comma + SBFA
7. MerkleDAG leaf + HMAC receipt created
8. Final root anchored on chosen settlement layer
9. KYA compliance receipt emitted (publicly verifiable)
```

---

## 8. Smart Contracts (Base Sepolia)

| Contract | Address |
|----------|---------|
| Identity Registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Reputation Registry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| Chain | Base Sepolia (84532) |
| Deployer | `0xdf6b8215D193b11B4903d223729c3CF7A6de271d` |

---

## 9. Patent Coverage

| Patent | Title | Status |
|--------|-------|--------|
| P-002 | Multiplicative GNN Reputation Engine | Filed |
| P-013 | KYA On-Chain Receipts | Attorney-ready |
| P-014 | Pythagorean Comma CIP | Attorney-ready |
| P-015 | Federated Learning Pricing | Attorney-ready |
| P-016 | Meta-verification (AI fact-checking AI) | Attorney-ready |
| P-018 | HyperDAG Protocol Architecture | This document |

---

## 10. Implementation Phasing

### Track A — Now (Documentation & Scaffold)
- Lock architecture spec in git (this document)
- TypeScript scaffolds for all modules (`src/`)
- Circuit parameters and router spec frozen

### Track B — Post April 30 (Implementation)
- Plonky3 RepID circuits (Rust)
- MerkleDAG consensus layer
- IOTA/HBAR/SOL intelligent bidder
- Full Rust Brain sprint

---

*Architecture designed by Sean Goodwin with research by Grok (AI Trinity Symphony).*
*Implementation by Claude Code + Gemini (AI Trinity Symphony).*
