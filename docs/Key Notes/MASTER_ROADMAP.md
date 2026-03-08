# Trinity Symphony — Master Roadmap
**Single Source of Truth · Paste at session start · Last updated: 2026-03-05**

---

## THE MISSION

> "A trust layer for AI — built by devs and AI, for people and AI, to validate, fact-check, and improve the quality of what AI gives to humans. No more fake news. No hallucinations. Algorithms that bring people together. AI that heals."

**For the last, the lost, and the least. — Micah 6:8**

This is not another AI chat wrapper. This is the **reputation-staked, consensus-verified, human-auditable trust protocol** that the big players won't build because it admits their outputs need verification. That gap is ours.

---

## WHAT IS TRINITY SYMPHONY

A 12-agent neuromorphic orchestration platform built on:
- **Byzantine Fault Tolerance** (HotStuff-2, 2-phase 2-chain)
- **ANFIS Intelligent Routing** (virtue-weighted: Truth 0.40 / Speed 0.30 / Stewardship 0.30)
- **RepID Reputation System** (behavioral scoring, stake-based accountability)
- **ZKP Identity Layer** (Plonky3 selective disclosure, ERC-8004 on Base)
- **HyperDAG Infrastructure** (Merkle DAG + pgvector + GraphRAG)
- **AGPLv3 Open Source** (free for individuals/nonprofits, commercial license for corporations)

**Confidence formula:** `C = max(A) × (1.0 − mean(A))`  
**Golden ratio threshold:** φ = 1.61803398875, ε = 1e-8  
**Supabase (Trinity):** qnnpjhlxljtqyigedwkb.supabase.co  
**Supabase (AISocialMirror):** oqufntblbuoeuhxqbspe.supabase.co  
**Hosted:** Railway (12 agents) + Vercel (web surfaces)  
**LinkedIn:** linkedin.com/in/privatemoney

---

## THE 12-AGENT SWARM

| Squad | Agents | Role |
|-------|--------|------|
| ALPHA (Truth) | VERITAS, NEXUS, TORCH | Validation, drift detection, knowledge |
| BETA (Care) | MEL, APM, CHESED | Community, monitoring, compassion |
| GAMMA (Build) | HDM, SOPHIA, GCM | Routing, ZKP/GNN, governance |
| ORCH (+3) | trinity-orch, trinity-w3c, trinity-shofet | Orchestration, Web3, judgment |

**Constitutional base:** constitutional-agent-base.js v8.2.0  
**Autonomy tiers:** Just Do It / Do Then Tell / Ask First  
**reflectOnResult():** fires after every critical action, updates RepID

---

## WHAT IS PROVEN REAL (Supabase evidence exists)

| Component | Proof | Date |
|-----------|-------|------|
| agent_artifacts partitioning | relkind=p, sprint_0 partition active | Phase 3 |
| schema_change_proposals | current_phase + quorum_certificate columns | Phase 3 |
| compute_bids table | exists, RPC accessible | Phase 3 |
| exec_sql v2 RPC | complex JSON subqueries working | Phase 3 |
| TAG arbitrage end-to-end | 2 rows: NODE (personal) + CLOUD (corporate) | Phase 3 milestone |
| db_routing_decisions | decided_at + metadata columns added | Phase 3 milestone |
| ANFIS stewardship weighting | Correct bid winner selection verified | Phase 3 milestone |
| hybrid_rag.py | BM25 + vector + LightRAG deployed | Phase 2 |
| VERITAS drift engine | Tiered alerting + BFT proposals | Phase 2 |
| Bayesian tuner scaffold | 500-sample guardrails | Phase 2 |
| dag_nodes + dag_edges | Tables created | Phase 1 |
| retrieval_logs | Table created | Phase 1 |
| pgvector + pg_trgm | Extensions enabled | Phase 2 |

---

## WHAT IS DEPLOYED BUT NOT YET PROVEN

| Component | Gap | Blocker |
|-----------|-----|---------|
| compute_bids live rows | Only test rows exist, no agent has bid in production | Needs live agent task to trigger |
| HotStuff-2 Commit path | Columns exist, no proposal has reached Commit in live DB | Glass Wall will make this visible |
| erc8004_agent_registry | Table doesn't exist in Supabase yet | Waiting for Base Sepolia deployment |
| NODE tier compute | Slot exists, zero real nodes | First compute contributors needed |
| Telegram HITL bridge | Spec complete, not yet built | Phase 4 |
| reflectOnResult → RepID chain | Not confirmed end-to-end | Needed for full loop |

---

## PATENT PORTFOLIO

| ID | Title | Status | Deadline |
|----|-------|--------|----------|
| P-001 | AI Trinity Symphony Orchestration | Provisional filed Aug 2025 | Aug 2026 non-provisional |
| P-002 | Multiplicative GNN Architecture (φ=1.618) | Provisional filed Aug 2025 | Aug 2026 non-provisional |
| P-003 | Question-Driven Reality Reorganization | Provisional filed Aug 2025 | Aug 2026 non-provisional |
| P-004 | ANFIS Virtue-Weighted Tier Routing + eBPF | **FILE THIS WEEK** | — |
| P-005 | HotStuff-2 BFT + ZKP-Weighted Governance | **FILE THIS WEEK** | — |
| P-006 | ERC-8004 Freemium Differential Access | File after Base Sepolia deployment | — |
| P-007 | Quantum Migration (Groth16 → Plonky3) | File before Phase 8 | — |
| P-008 | TAG Compute Arbitrage Marketplace | File before public launch | — |

**P-004/P-005 memo corrections (complete, attorney-ready):**
1. ✅ HotStuff-2 (2-phase 2-chain) — aligned with deployed code
2. ✅ BLS12-381 quantum caveat — explicit FROST migration path noted
3. ✅ GNN 22% precision — baseline documented as unweighted BM25/Vector

**Strongest novel claim:** ZKP-Weighted BFT Governance — agent vote weight dynamically adjusted by ZK-verified RepID score. No prior art for this combination.

---

## AI OWNERSHIP LANES

**Do not duplicate. Do not ask one AI what another AI owns.**

### Gemini (Antigravity IDE)
**Owns: Build**
- All code, Railway deployments, Supabase schema
- Agent implementation, file editing, test execution
- Glass Wall frontend (app.aitrinitysymphony.com)
- Rust Core microservice (Phase 3.5)
- Never ask Gemini for strategy — give Gemini specs, get code back

### Grok
**Owns: Patents**
- Final claim language for P-004 and P-005
- Prior art research and verified patent number table
- Draft abstracts for each filing
- Never ask Grok to build code or design architecture

### Claude
**Owns: Architecture decisions + Frontend design + Master roadmap**
- Cross-validation of Gemini/Grok outputs
- Decision gates before phase transitions
- Mobile/web UI design (controller.aitrinitysymphony.com, event cards)
- This document — update after each session
- Never ask Claude to build backend code Gemini should own

### Sean
**Owns: Mission, patent filing, HITL decisions, final approval**
- Files patents with attorney
- Approves phase transitions
- Makes HITL decisions via Telegram
- Defines what success looks like

---

## DECISION GATES (require Sean approval)

These decisions need cross-AI validation before proceeding:
- Phase transitions (e.g., Phase 3 → 3.5 → 4)
- Infrastructure migrations (Railway → DigitalOcean)
- New patent filings
- Public launch of any surface
- Any change to virtue weights or confidence formula
- TOKEN economics decisions

These do NOT need cross-AI validation (Gemini decides):
- Schema column additions
- Bug fixes within existing components
- Test script execution
- reflectOnResult() scoring adjustments
- Supabase index additions

---

## CURRENT PHASE STATUS

### ✅ Phase 0-3: COMPLETE
All foundation, observability, hybrid RAG, drift prediction, scalability, patent gate done.
**Milestone proven:** TAG arbitrage end-to-end, two rows in compute_bids.

### 🔄 Phase 3.5: IN PROGRESS (Gemini)
- [ ] Rust Core microservice on Railway (`/consensus` + `/verify` endpoints)
- [ ] Confirm hotstuff-rs supports HotStuff-2 2-chain before writing Rust
- [ ] Rust as standalone HTTP service — NOT FFI into Node.js
- [ ] Solana Signal Lane: architecture design only (deploy Phase 5)
- [ ] BYOK: User A's keys serve User A only — never cross-user

### 🔄 Phase 4: IN PROGRESS (Gemini + Claude)
- [ ] Glass Wall: app.aitrinitysymphony.com — Mock Mode first, Supabase Realtime Phase 2
- [ ] Primary metric: Hours autonomous since last HITL (live counter)
- [ ] Secondary: One recent autonomous decision as a story with receipts
- [ ] NODE tier shown as "0 nodes — accepting contributors" (honest)
- [ ] Telegram HITL bridge (spec complete per telegram-hitl-bridge-spec.md)
- [ ] controller.aitrinitysymphony.com (login-gated, write access)
- [ ] Telegram actionable alerts (Approve/Reject inline buttons)

### ⏳ Phase 5-10: QUEUED
- Node Marketplace (BYOK + GPU compute sharing)
- RepID on-chain sync
- HyperDAG Immutable Tier + Plonky3
- Solana Signal Lane deployment
- Patent non-provisional conversions (Aug 2026)

---

## INFRASTRUCTURE

| Service | Provider | Purpose |
|---------|----------|---------|
| Agent hosting | Railway | 12 agents, 53 env vars |
| Primary DB | Supabase | 276 tables, 281k daily requests |
| Cache | Dragonfly | HOT tier, <3ms p95 |
| Vectors | pgvector | Semantic search |
| Web surfaces | Vercel | app + controller subdomains |
| Blockchain | Base Sepolia → Mainnet | ERC-8004 identity |
| Compute bids | Local/Cloud/NODE/P2P | TAG arbitrage |
| LLM providers | 18 providers via ANFIS | Routed by virtue weights |

**Migration stance:** Stay on Railway through Phase 4. Evaluate DigitalOcean/Kubernetes if monthly cost exceeds $200. Migration cost currently exceeds savings.

---

## BYOK + NODE MARKETPLACE RULES

1. BYOK: User A's API keys serve User A's requests ONLY. Never cross-user. Hard architectural constraint — not a policy.
2. NODE tier: Users contribute GPU compute running open-source models (Ollama/Llama/Mistral). Not API key sharing. Clean of ToS violations.
3. Positioning: "Contribute compute, earn RepID" — not "share your keys."
4. NODE_BID slot exists in solicit_bids(). Real node registration pending first contributor.

---

## THE TRUST LOOP (share this with developers)

```
Watch the machine (app.aitrinitysymphony.com — live autonomous operation)
        ↓
Verify the identity (TrinityIdentityAdapter on Base Sepolia)
        ↓
Read the math (Patent memos + technical whitepaper)
        ↓
Contribute and earn RepID (GitHub + NODE marketplace)
```

---

## SESSION START PROTOCOL

Paste this document at the start of each session with any AI.
Then state: what was last proven REAL, what you need next, which AI you're talking to.

**Do not reconstruct context from memory. Use this document.**

---

## CORE PRINCIPLES (non-negotiable)

- Truth over flattery — from every AI, always
- REAL / SIMULATED / NOT BUILT — never conflate these
- Query schema before writing SQL — BIGINT not UUID
- Fix only the specific error — never remove "unnecessary" code
- Verify before claiming — proof of work to sprint_updates
- Shortest path to done — no busywork, no duplicate work
- Micah 6:8 — act justly, love mercy, walk humbly

---

*Trinity Symphony v2026.03.05 · Sean Patrick Goodwin · Janitor for Jesus · Nerd for Jesus*  
*φ = 1.61803398875 · ε = 1e-8 · "Helping people help people"*
