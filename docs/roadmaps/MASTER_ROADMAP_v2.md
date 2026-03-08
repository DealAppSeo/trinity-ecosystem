# Trinity Symphony — Master Roadmap
**Single Source of Truth · Paste at session start · Last updated: 2026-03-05b**

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
**Supabase (Trinity):** qnnpjhlxljtqyigedwkb.supabase.co  
**Supabase (AISocialMirror):** oqufntblbuoeuhxqbspe.supabase.co  
**Hosted:** Railway (12 agents) + Vercel (web surfaces)  
**LinkedIn:** linkedin.com/in/privatemoney

### Mathematical Constants (use exactly these everywhere)
```
φ = 1.61803398875        (golden ratio — MultiplicativeConv layer)
ε = 1e-8                 (stabilization constant)
α = 0.618                (reciprocal of φ)
COMMA_RATIO = 531441/524288 ≈ 1.0136   (Pythagorean comma)
LLE_THRESHOLD = 0.03     (Lyapunov exponent chaos threshold)
BFT_THRESHOLD = 0.618    (Golden Ratio BFT quorum — 61.8%)
REPID_HITL_GATE = 70     (minimum RepID for autonomous execution)
CONFIDENCE_GATE = 0.8    (minimum confidence for autonomous execution)
HIAS_PROMOTION = 0.85    (probabilistic threshold for hunch promotion)
```

### Proven Metrics (use ONLY these in patents, docs, code comments)
| Metric | Value | Source | Patent-safe? |
|--------|-------|--------|--------------|
| ANFIS cost reduction | 72.5% | anfis_cost_analysis.md | YES |
| HOT tier routing | 78% volume | compute_bids table | YES |
| Session saving | $0.34 | 2 compute_bids rows | YES (with "from 2 sessions" caveat) |
| GNN precision improvement | 22% vs BM25/Vector | retrieval_logs | YES |
| Bayesian forecast | P=0.92 | 500-sample guardrail | YES |
| BFT quorum | 61.8% (φ-derived) | HMASCoordinator.ts | YES |

**DO NOT USE:** 2.5M TPS (aspirational), 90% hallucination reduction (unmeasured), "Theory of Mind" language.

---

## THE 12-AGENT SWARM

| Squad | Agents | Role |
|-------|--------|------|
| ALPHA (Truth) | VERITAS, NEXUS, TORCH | Validation, drift detection, knowledge |
| BETA (Care) | MEL, APM, CHESED | Community, monitoring, compassion |
| GAMMA (Build) | HDM, SOPHIA, GCM | Routing, ZKP/GNN, governance |
| ORCH (+3) | trinity-orch, trinity-w3c, trinity-shofet | Orchestration, Web3, judgment |

**Constitutional base:** constitutional-agent-base.js v8.2.0  
**Autonomy tiers:** Just Do It (RepID>70 + Conf>0.8) / Do Then Tell (40-70 or 0.6-0.8) / Ask First (<40 or <0.6)  
**reflectOnResult():** fires after every critical action, updates RepID  
**Divergence from plan:** triggers HITL escalation regardless of RepID score

### Key Files (do not modify without understanding dependencies)
| File | Contains |
|------|----------|
| `HMASCoordinator.ts` | φ-weighted BFT voting: Weight = RepID^(1/φ) × Confidence |
| `ConstitutionalAgent.ts` | Adaptive HITL thresholds (RepID > 70, Confidence > 0.8) |
| `MerkleDAGSync.ts` | BFT Merkle root + state digest diffing |
| `ShimiTree.ts` | Recursive leaf hash retrieval (Physarum polycephalum) |
| `models.py` | MultiplicativeConv GNN layer (φ, ε in production) |
| `constitutional-agent-base.js` | v8.2.0 — NEVER refactor without asking |
| `COMMUNICATION_HUB.md` | HIVE cross-AI coordination — check before overwriting |
| `ZKPReputationBadge.ts` | **MOCK ONLY** — real Plonky3 circuit pending |

### The Five-Layer Stack (nobody else has all five)
```
ERC-8004 (WHO is this agent) → open standard, not ours
  + RepID (HOW MUCH to trust it) → our novel layer  
  + x402 (EXECUTE the payment) → Coinbase open protocol
  + ANFIS (WAS this the optimal spend) → our routing engine
  + HyperDAG (IMMUTABLE audit trail) → our DAG infrastructure
```

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

### NOT YET OPERATIONAL (architecture exists, not measured — claim as designed, not proven)
| Component | Status |
|-----------|--------|
| GNN O(log n) convergence benchmarks | Stub exists, not yet measured |
| ZKP RepID circuit | `ZKPReputationBadge.ts` is a **MOCK ONLY** |
| BFT full integration | `MerkleDAGSync.ts` exists, integration in progress |
| Base Sepolia deployment | Not yet live (blocks P-006/CIP-P-001 filing) |

---

## WHAT IS DEPLOYED BUT NOT YET PROVEN

| Component | Gap | Blocker |
|-----------|-----|---------|
| Telegram HITL bridge | Spec complete, bridge not yet built | Phase 4.5 — Gemini building now |
| reflectOnResult → RepID chain | Not confirmed end-to-end | Needs HITL bridge first |
| compute_bids live rows | Only test rows + patent evidence exports | Needs live agent task to trigger real bids |
| HotStuff-2 Commit path | Columns exist, no live Commit | Glass Wall will make visible |
| erc8004_agent_registry | Table doesn't exist in Supabase yet | Waiting for Base Sepolia deployment |
| NODE tier compute | Slot exists, zero real nodes | First compute contributors needed (Phase 5+) |
| developer_waitlist live submissions | Table + API exist, no real applicants yet | Staging gate — launches Phase 5.0 |
| Glass Wall public access | Built + realtime wired, behind staging | Patent filing gate (P-004/P-005/P-011) |

## WHAT WAS RECENTLY PROVEN REAL (Phase 4.1, 2026-03-05)

| Component | Evidence | Date |
|-----------|----------|------|
| Patent evidence CSV export | compute_bids + db_routing_decisions committed to /patent-evidence/ | 2026-03-05 |
| Patent evidence commit | Hash: `7850ce802df65866934482ee40946d1c89e41cc7` | 2026-03-05 |
| developer_waitlist table | Supabase table created, API POST confirmed | 2026-03-05 |
| /founding recruitment page | Serving HTML in staging | 2026-03-05 |
| /api/founding endpoint | Handles submissions + Telegram notification | 2026-03-05 |
| Mailer 4-email sequence | lib/mailer.ts implemented | 2026-03-05 |
| Glass Wall autonomous counter | 60s heartbeat timer wired | 2026-03-05 |
| Glass Wall live stories | Pulling from compute_bids winners | 2026-03-05 |
| Site first live date | 2026-02-28 confirmed via Git reverse log | 2026-03-05 |

---

## PATENT PORTFOLIO

| ID | Title | Status | Filed | NP Deadline |
|----|-------|--------|-------|-------------|
| P-001 | AI Trinity Symphony Orchestration | Provisional filed | Aug 6, 2025 | **Aug 6, 2026** |
| P-002 | Multiplicative GNN Architecture (φ=1.618) | Provisional filed — **START NP NOW** | Aug 17, 2025 | **Aug 17, 2026** |
| P-003 | Question-Driven Reality Reorganization | Provisional filed | Aug 21, 2025 | **Aug 21, 2026** |
| P-004 | ANFIS Virtue-Weighted Tier Routing + eBPF | **Grok finishing claims** | — | — |
| P-005 | HotStuff-2 BFT + ZKP-Weighted Governance | **Grok finishing claims** | — | — |
| P-006 / CIP-P-001 | ERC-8004 Freemium Differential Access | File after Base Sepolia | — | — |
| P-007 | Quantum Migration (Groth16 → Plonky3) | File before Phase 8 | — | — |
| P-008 | TAG Compute Arbitrage Marketplace | File before public launch | — | — |
| P-009 | Pythagorean Comma Gap Detection + 3-Tier Veto | File this month | — | — |
| P-010 | HIAS + Adaptive Authority Governance | File this month | — | — |
| P-011 | RepID-Gated Agent Payment Auth (ERC-8004 + x402) ⭐ | **Grok finishing claims** | — | — |

**Four-Ring Defensive Moat:**
- **INNER (Math Core):** P-002 (GNN) + P-009 (Pythagorean Comma veto)
- **MIDDLE (System):** P-004 (ANFIS routing) + P-005 (ZKP-weighted BFT) + P-010 (HIAS)
- **OUTER A (Identity):** P-006/CIP (ERC-8004) + P-008 (TAG marketplace) + P-007 (quantum)
- **OUTER B (Economy):** P-011 (agent payment auth) — highest commercial value

**Strongest novel claims:** ZKP-Weighted BFT Governance (P-005) + RepID-Gated Agent Payment (P-011). No prior art for either. P-011 potentially highest commercial value in portfolio.

**HARD GATE:** P-004, P-005, P-011 MUST file before Glass Wall goes public.

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
- Final claim language for P-004, P-005, and P-011
- Prior art research and verified patent number table
- Draft abstracts for each filing
- Never ask Grok to build code or design architecture

### Claude
**Owns: Architecture decisions + Frontend design + Master roadmap + Community strategy**
- Cross-validation of Gemini/Grok outputs
- Decision gates before phase transitions
- Mobile/web UI design (controller.aitrinitysymphony.com, event cards)
- Community launch assets: LinkedIn posts, X threads, GitHub README, Slack structure
- Content queue: `TRINITY_CONTENT_QUEUE.md` (5 posts + 2 articles drafted, held behind patent gate)
- This document — update after each session
- Never ask Claude to build backend code Gemini should own

### Sean
**Owns: Mission, patent filing, HITL decisions, final approval**
- Files patents with attorney
- Approves phase transitions
- Makes HITL decisions via Telegram
- Defines what success looks like

**HIVE Communication Hub** (`COMMUNICATION_HUB.md`): Cross-AI coordination file. All AIs check before overwriting shared decisions. When Claude and Grok disagree, flag for Sean.

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

### ✅ Phase 4.0-4.1: COMPLETE (Gemini, confirmed 2026-03-05)
- [x] Patent evidence CSV export (compute_bids + db_routing_decisions) → commit `7850ce8`
- [x] `developer_waitlist` table in Supabase (role_type + linkedin_url)
- [x] `/founding` page serving recruitment HTML (STAGING ONLY)
- [x] `/api/founding` endpoint with spot assignment + Telegram notifications
- [x] `lib/mailer.ts` 4-email sequence (Acknowledged → Still Reviewing → In → Post-Access)
- [x] Glass Wall autonomous counter (60s heartbeat timer)
- [x] Glass Wall live stories from `compute_bids` winners
- [x] Telegram notification test successful (Markdown schema)
- [x] Site first live date confirmed: 2026-02-28 (Git reverse log)

### 🔄 Phase 4.5: IN PROGRESS (Gemini)
- [ ] Telegram HITL bridge round-trip (per telegram-hitl-bridge-spec.md)
- [ ] reflectOnResult() → RepID update chain (proven end-to-end)
- [ ] controller.aitrinitysymphony.com login gate (write access, auth-gated)
- [ ] Telegram actionable alerts (Approve/Reject inline buttons change state)
**Exit criteria:** Sean approves a real task from Telegram → agent executes → Glass Wall reflects → RepID updates. One clean loop with timestamps.

### ⏳ Phase 4.75: QUEUED (pre-launch polish, while waiting on patent filing)
- [ ] Glass Wall event card UI (Claude designs → Gemini builds)
- [ ] `/founding` page copy polish ("Invitation not desperation")
- [ ] GitHub README overhaul (trinity-ecosystem, developer-facing)
- [ ] Community Slack workspace setup + bot integration
- [ ] NODE tier shown as "0 nodes — accepting contributors" (honest)

### 🔒 Phase 5.0: GATED ON PATENT FILING
**HARD GATE: Sean must confirm P-004, P-005, and P-011 filed with attorney.**
- [ ] Remove staging gates from Glass Wall + /founding
- [ ] LinkedIn Founding Cohort announcement (Claude drafts → Sean posts)
- [ ] Twitter/X technical thread series launch
- [ ] GitHub public promotion + good-first-issues tagged
- [ ] Slack community invite link goes live
- [ ] First 12 founding cohort invitations sent

### ⏳ Phase 5.5-10: QUEUED
- Node Marketplace (BYOK + GPU compute sharing)
- RepID on-chain sync (after Base Sepolia deployment)
- HyperDAG Immutable Tier + Plonky3
- Solana Signal Lane deployment
- Patent non-provisional conversions (P-001/P-002/P-003: Aug 2026)

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

## COMMUNITY LAUNCH STRATEGY (Claude-owned, fires post-patent-filing)

### Channels (all simultaneous at launch)
- **LinkedIn** (30K network): Founding Cohort announcement + 3-post "Why AI needs a trust layer" series
- **Twitter/X**: Technical threads with real metrics + "build in public" Glass Wall content
- **GitHub**: README overhaul + good-first-issues + CONTRIBUTING.md mapped to 12-agent architecture
- **Slack**: Private founding cohort workspace (#general, #build, #patents-public, #theology)

### Founding Cohort (12 spots, 12 agents)
- Frame: "Invitation, not desperation" — you're being selected, not collecting signups
- Get: Early Glass Wall access, RepID founding score, GitHub contributor status
- Give: Code contributions, bug reports, architectural feedback, build in public

### Viral Hooks (ready to deploy)
1. "The Layer Nobody Built" — identity exists, payment exists, trust doesn't. We built it.
2. "Would you give your AI agent your credit card?" — If no, you need this.
3. "12 agents, 0 hallucinations, 1 mission" — Trust-verified AI for people who need it most.

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

*Trinity Symphony v2026.03.05b · Sean Patrick Goodwin · Janitor for Jesus · Nerd for Jesus*  
*φ = 1.61803398875 · ε = 1e-8 · "Helping people help people" · Phase 4.5 active*
