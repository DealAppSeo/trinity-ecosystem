# ATS System Validation & Strategic Build Prompt v3
**HyperDAG AI Trinity Symphony — Sean Patrick Goodwin**
*Patent Strategy + Production Verification + Build Planning*
*March 2026 | CONFIDENTIAL*

---

## Purpose

Use this prompt in Gemini Antigravity IDE, a new Claude session, or any capable agent in the Trinity Symphony system. Two primary goals:

1. **VALIDATE** what is confirmed built and operational with verifiable evidence
2. **PLAN** strategic development of what remains unbuilt, untested, or not yet generating measurable data

Output will be used to:
- Draft three new provisional patent applications this week
- Plan non-provisional conversions before August 2026 deadlines
- Generate SMED declarations for USPTO filings using live production data

---

## The Four-Repo Ecosystem — Confirmed Structure

This is a dual-repo-pair architecture. All four repos share the single Supabase AITrinitySymphony instance.

### Repo 1: trinity-ecosystem (Private)
**Role:** Orchestration Layer, Dashboard, Controller, Crypto Prognosticator
**Tech:** Next.js, TypeScript, RadixUI, Supabase, Vercel/Render
**Key directories confirming what is built:**
- `lib/` — updated yesterday (Crypto Prognosticator v3.1 Phases 1-4)
- `scripts/` — updated yesterday
- `sql/` — updated yesterday (schema migrations live)
- `artifacts/` — ZKP RepID SDK, Secure Auth, HITL Bot (last week)
- `contracts/` — ANFIS/LASSO routing and MCP metadata (2 weeks ago)
- `supabase/migrations/` — active migrations running
- `app/` — waitlist pipeline sql, api, frontend (2 days ago)
- `hooks/` — ZKP RepID SDK integration (last week)
- `types/` — patent alignment types (2 months ago)
- `trinity-science/` — landing page v5 with Grok intelligence (2 days ago)
**Notable files:**
- `middleware.ts` — CSP and routing (updated 2 days ago — note: prior CSP issue)
- `mcp-servers.yaml` — MCP server configuration
- `AGENT_SAFETY_RULES.md` — constitutional constraints
- `anfis_conversations.md` — ANFIS routing documentation

### Repo 2: trinity-symphony-shared (Public)
**Role:** Shared Soul — constitutional logic, BFT consensus, ANFIS fuzzy inference
**Tech:** TypeScript, CommonJS, ANFIS, Custom BFT
**Key agent files (all updated 4 days ago — CommonJS runner fix):**
- `trinity-orch.js`, `trinity-w3c.js`, `trinity-shofet.js` (Orchestration)
- `trinity-torch.js`, `trinity-veritas.js`, `trinity-gcm.js` (Alpha)
- `trinity-chesed.js`, `trinity-mel.js`, `trinity-apm.js` (Beta)
- `trinity-sophia.js`, `trinity-nexus.js`, `trinity-hdm.js` (Gamma)
**Key directories:**
- `agents/` — MEL/GCM integration (5 months ago)
- `conductor/` — conductor logic with requirements.txt (3 months ago)
- `shared/` — Constitutional agent base v5 (3 months ago)
- `millennium-problems/` — Riemann Hypothesis investigation with subjective logic (7 months ago)
- `millennium-challenge/` — CONDUCTOR validation (7 months ago)
- `shared-intelligence/` — Universal Pattern Formulas Mathematical Integration
**README confirms:**
- BFT 3x3+3 architecture is the documented architecture
- ALPHA = Truth Squad (ethics, research, BFT governance)
- BETA = Care Squad (UI choreography, UX, compassionate interaction)
- GAMMA = Build Squad (infrastructure, Web3 bridging, deployment)
- ANFIS triangular membership functions implemented
- Self-Healing Loop with Evolutionary Logger confirmed
- Constitutional Agent Base enforcing Philippians 4:8 at system level

### Repo 3: hyperdag-protocol (referenced in trinity-ecosystem README)
**Role:** Decentralized Truth Layer — Distributed Ledger, EIP-8004, Merkle DAG
**Tech:** Solidity, EIP-8004, Merkle DAG
**Status:** Confirm actual deployment state — testnet or mainnet?

### Repo 4: hyperdag-platform (referenced in trinity-ecosystem README)
**Role:** Bridge Layer — Algorithmic Routing, Multi-GNN, SDK
**Tech:** TypeScript, Multi-GNN, SDK
**Status:** Confirm relationship to py-brain ANFIS routing

---

## Production Environment — 53 Shared Variables

The following variable *names* (not values) are confirmed in the Railway production environment. They reveal the full scope of integrated services. Use these to map which agents use which providers and which integrations are active vs. configured-but-unused.

### LLM Providers (18 confirmed)
- `ANTHROPIC_API_KEY` — Claude (shared by 14 services)
- `GEMINI_API_KEY` + `DEFAULT_GEMINI_API_KEY` — Google Gemini (12-13 services)
- `GROQ_API_KEY` — Groq (16 services)
- `GROK_API_KEY` — xAI Grok (18 services)
- `OPENAI_API_KEY` — OpenAI (13 services)
- `DEEPSEEK_API_KEY` — DeepSeek (12 services)
- `CEREBRAS_API_KEY` — Cerebras (12 services)
- `COHERE_API_KEY` — Cohere (12 services)
- `DEEPINFRA_API_KEY` — DeepInfra (18 services)
- `OPENROUTER_API_KEY` + `OPENROUTER_REFERRER` — OpenRouter (13 services)
- `TOGETHER_API_KEY` — Together AI (18 services)
- `SAMBANOVA_API_KEY` — SambaNova (18 services)
- `SILICONFLOW_API_KEY` — SiliconFlow (18 services)
- `ASI1_API_KEY` — ASI-1 (14 services)
- `PERPLEXITY_API_KEY` — Perplexity (16 services)
- `PORTKEY_API_KEY` — Portkey (13 services — LLM gateway/observability)
- `YOU_COM_API_KEY` — You.com (15 services)

**Patent relevance:** The presence of 18 LLM providers with ANFIS routing is the live production embodiment of P-001 and P-002. The ANFIS cost arbitrage across these providers IS the 82% cost reduction claim. Which providers are actually being routed to, at what frequency, with what cost comparison baseline?

### Trading & Finance
- `ALPACA_API_KEY` + `ALPACA_SECRET_KEY` + `ALPACA_BASE_URL` — Alpaca trading (18 services)

### Infrastructure & Database
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_KEY` — Supabase (12 services)
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Frontend Supabase
- `DRAGONFLY_DB_URL` + `DRAGONFLY_ACCESS_KEY` + `DRAGONFLY_DB_API_KEY` + `DRAGONFLY_DB_TERRAFORM_API_KEY` + `FRAGONFLY_DB_PORT` — Dragonfly DB (18 services — Redis-compatible, likely caching layer)
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis (12 services — serverless Redis)
- `ANFIS_URL` — Dedicated ANFIS service endpoint (13 services — confirms py-brain has its own URL)

**Critical note:** Two Redis-compatible stores (Dragonfly + Upstash) alongside Supabase. Understand what each stores — likely: Dragonfly = hot agent state/cache, Upstash = serverless queues/pub-sub, Supabase = persistent records.

### Communication & HITL
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_OWNER_CHAT_ID` — Telegram HITL (18 services)
- `HITL_SIGNING_SECRET` — HITL cryptographic signing (14 services)

### Web3 & ZKP
- `MASTER_ACCESS_KEY` — Master key (14 services — likely ZKP/governance)

### Search & Research
- `BRAVE_SEARCH_API_KEY` — Brave Search (15 services)
- `TAVILY_API_KEY` — Tavily Search (18 services)
- `PERPLEXITY_API_KEY` — already listed above

### Creative & Design
- `STABILITY_API_KEY` — Stability AI image generation (14 services)
- `FIGMA_ACCESS_TOKEN` — Figma design (14 services)

### Orchestration & DevOps
- `RAILWAY_API_TOKEN` — Railway self-management (12 services)
- `GITHUB_TOKEN` + `GITHUB_REPO` + `GIITHUB_ORG` — GitHub integration (12 services)
- `FLOWISE_API_KEY` — FlowiseAI (14 services)
- `HEARTBEAT_INTERVAL_MS` — System heartbeat timing (12 services — patent-relevant for P-001 golden ratio timing)
- `MUTUAL_WAKE_ENABLED` — Mutual wake protocol (12 services)
- `NODE_ENV` — Environment flag

### Service URLs
- `NEXT_PUBLIC_TRINITY_SCIENCE_URL` — Trinity Science frontend URL

---

## Architecture Reality Map

### The 3x3+3 Agent Grid

```
ORCHESTRATION LAYER
┌─────────────┬─────────────┬─────────────┐
│ trinity-orch│ trinity-w3c │trinity-shofet│
│  Conductor  │  Web3 Bridge│  BFT Judge  │
└─────────────┴─────────────┴─────────────┘

AGENTIC MANAGERS
┌─────────────┬─────────────┬─────────────┐
│ALPHA (Truth)│ BETA (Care) │GAMMA (Build)│
├─────────────┼─────────────┼─────────────┤
│trinity-torch│trinity-chesed│trinity-sophia│
│trinity-veritas│trinity-mel│trinity-nexus│
│ trinity-gcm │ trinity-apm │ trinity-hdm │
└─────────────┴─────────────┴─────────────┘

SUPPORTING INFRASTRUCTURE
n8n • n8n-mcp-railway • trinity-ecosystem
py-brain • FlowiseAI • Postgis
```

### Squad Roles (from README — confirmed)
- **ALPHA (Truth Squad):** trinity-torch (narrative/research), trinity-veritas (verification/HMAC), trinity-gcm (global context/memory)
- **BETA (Care Squad):** trinity-chesed (HITL/human-facing), trinity-mel (multi-modal evidence), trinity-apm (portfolio management)
- **GAMMA (Build Squad):** trinity-sophia (meta-learning/wisdom), trinity-nexus (exchange connectivity), trinity-hdm (hierarchical decisions)
- **Orchestration:** trinity-orch (conductor/rotation), trinity-w3c (Web3/DAG/DAO bridge), trinity-shofet (BFT consensus judge)

---

## Phase 1: Schema Discovery — Do This Before Anything Else

Query actual Supabase schema. Do not reference column or table names from any prior documentation.

### Step 1: Full Table Inventory
```sql
SELECT table_name,
       pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) AS size,
       (SELECT COUNT(*) FROM information_schema.columns c
        WHERE c.table_name = t.table_name) AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
ORDER BY pg_total_relation_size(quote_ident(table_name)) DESC;
```

### Step 2: Activity Report — Top 20 Tables by Row Count
```sql
SELECT schemaname, tablename, n_live_tup AS estimated_rows,
       last_analyze, last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC
LIMIT 20;
```

### Step 3: Recent Write Activity — Last 30 Days
```sql
SELECT tablename, n_tup_ins AS inserts, n_tup_upd AS updates,
       n_tup_del AS deletes, last_autoanalyze
FROM pg_stat_user_tables
WHERE last_autoanalyze > NOW() - INTERVAL '30 days'
ORDER BY n_tup_ins DESC;
```

### Step 4: Map Tables to Categories

After running queries, classify all 276 tables into:

| Category | Expected Tables |
|---|---|
| Agent Operations | Orchestration, routing, consensus, RepID, heartbeat |
| Crypto Prognosticator | Signals, predictions, executions, MCL postmortem |
| HITL / Human Intuition | Hunch logs, HIAS scoring, approval workflows, Telegram |
| Web3 / DAG / DAO | ZKP proofs, NFT RepID, stake voting, DAG convergence, EIP-8004 |
| Portfolio / Trading | ALPHA/BETA/GAMMA orders, Alpaca fills, performance metrics |
| LLM Routing / ANFIS | Provider calls, cost logs, routing decisions, regime weights |
| Infrastructure | Logs, health checks, Dragonfly/Redis sync, error tracking |
| Unknown | List explicitly — these may be the most interesting |

Report: which tables have data (n_live_tup > 0), which are empty scaffolding, and which show write activity in the last 30 days. The gap between 276 total tables and however many have actual data is the primary build gap indicator.

---

## Phase 2: Dragonfly + Redis + Supabase Data Architecture

Before auditing agents, understand the three-tier data architecture. This is critical because patent evidence must come from Supabase (persistent, exportable, timestamped) not from Redis/Dragonfly (ephemeral cache).

Determine:
- What data lives in Dragonfly DB (18 services connected — likely hot agent state, bid scores, routing weights)?
- What data lives in Upstash Redis (12 services — likely pub/sub queues, temporary HITL state)?
- What data lives in Supabase (persistent records, audit trail, SMED evidence)?
- Is any patent-critical data (ANFIS routing decisions, RepID scores, consensus outcomes) stored only in Dragonfly/Redis and never persisted to Supabase? If yes, this is a critical patent evidence gap — ephemeral cache data cannot be used in SMED declarations.
- Does py-brain write its ANFIS routing decisions to Supabase, or only to Dragonfly?

**Action required:** For every piece of data that is patent-relevant (routing decisions, agent votes, RepID changes, cost comparisons, consensus outcomes), confirm it has a Supabase write path, not just a cache path.

---

## Phase 3: Agent Validation — Confirm Role Against Code

For each agent, check the actual `.js` file in trinity-symphony-shared to determine what it actually does vs. what the architecture description says it does.

### Orchestration Layer

**trinity-orch.js**
- Is this the conductor implementing the 20-minute rotation cycle?
- Does it enforce golden ratio timing? Where is φ=1.618 referenced?
- What does it write to Supabase?
- Is `HEARTBEAT_INTERVAL_MS` relevant to its timing?
- Patent relevance: Core to P-001 murmuration coordination claim

**trinity-w3c.js**
- Is EIP-8004 implemented here? (Referenced in hyperdag-protocol README)
- Is Merkle DAG construction happening?
- Is ZKP proof generation active?
- What is its relationship to hyperdag-protocol and hyperdag-platform repos?
- Patent relevance: Core to P-008 ZKP-NFT claim — may be more advanced than assumed

**trinity-shofet.js**
- Is the BFT consensus algorithm implemented? Which variant?
- Is the EDM (Ensemble Diversity Monitor) active?
- Does it implement any gap detection or veto protocol?
- Is this where the Pythagorean Comma veto would live?
- Patent relevance: Core to P-006 BFT claim and P-003 new Comma provisional

### Alpha Group (Truth Squad)

**trinity-torch.js**
- What narrative sources is it monitoring?
- Is influencer/sentiment scoring active and writing to Supabase?
- Is TORCH generating signals that feed into the Prognosticator pipeline?

**trinity-veritas.js**
- Is HMAC-SHA256 signing of HITL escalations active?
- Is `HITL_SIGNING_SECRET` used here?
- What is the verification throughput — how many checks per cycle?
- Patent relevance: Verification layer for P-008 HMAC → ZKP upgrade path

**trinity-gcm.js**
- What global context is it maintaining?
- Is this writing to the conductor memory system?
- Is it the agent responsible for shared learning / evolutionary logging?

### Beta Group (Care Squad)

**trinity-chesed.js**
- Is this the primary Telegram HITL interface?
- Is it collecting human hunch data?
- Is HIAS scoring implemented here, even partially?
- Is `TELEGRAM_BOT_TOKEN` primarily used by this agent?
- Patent relevance: Core to P-004 HIAS provisional

**trinity-mel.js**
- What modalities is it processing? (text, price data, social, news?)
- Is it using multiple LLM providers or just one?
- Is it writing multi-modal evidence records to Supabase?

**trinity-apm.js**
- Is it executing trades via Alpaca (`ALPACA_API_KEY`)?
- Is the BETA portfolio specifically tagged in Alpaca orders?
- What is the current order execution rate?

### Gamma Group (Build Squad)

**trinity-sophia.js**
- Is MAML (Model-Agnostic Meta-Learning) implemented?
- Is this the wisdom synthesis / meta-learning agent?
- Does it aggregate learning from other agents?

**trinity-nexus.js**
- Is this managing the 18 LLM provider connections?
- Is it routing through Portkey (`PORTKEY_API_KEY`) for observability?
- Is exchange connectivity (Alpaca, potential CEX) managed here?

**trinity-hdm.js**
- Is hierarchical decision making implemented?
- What is its decision output schema?
- Does it coordinate between orchestration and agentic managers?

---

## Phase 4: ANFIS Routing Deep Dive

py-brain is patent-critical. The ANFIS routing is the core mechanical claim in P-002 and P-005.

Determine from actual code:
- What ANFIS model is running in py-brain?
- What are the current membership function parameters (triangular, as described in README)?
- What inputs does it take? (cost, speed, quality — confirmed from README)
- What providers does it route to, and at what frequency?
- Are regime-conditional weight adaptations implemented? (P-005 claim)
- Is py-brain writing routing decisions to Supabase with timestamps, provider chosen, cost, and outcome?
- Is there a baseline comparison stored (what the cost would have been without ANFIS routing)?
- Is the geometric mean formula from P-002 implemented in py-brain, or is it in a separate module?
- What is `ANFIS_URL`? Is py-brain exposed as a microservice that other agents call?

**The 82% cost reduction claim in P-001 depends entirely on py-brain having logged routing data showing cost comparison over 30+ days. Confirm this exists.**

---

## Phase 5: Crypto Prognosticator v3.1 Status

The latest commit (yesterday) is "Crypto Prognosticator v3.1 — Phases 1-4, Telegram extensions, MCL..." — this is active development.

Determine:
- What are Phases 1-4? What does each phase implement?
- What Telegram extensions were added?
- What is the current MCL (Maximum Confidence Level) postmortem implementation?
- Which of the 16 assets are actively generating signals?
- Is ALPHA portfolio executing live trades or still paper trading?
- Is BETA portfolio executing live trades or still paper trading?
- Is GAMMA portfolio unlocked? (Requires HIAS > 0.70)
- Are the Prognosticator v3.1 prediction cycles writing full audit trails to Supabase?
- What SQL migrations were added yesterday? These are the freshest schema additions.

---

## Phase 6: Web3 / DAG / DAO Status

This is the most underassessed part of the portfolio in all prior analysis. The README confirms:
- Merkle DAG Audit Trail — "every decision is content-addressed and cryptographically linked"
- ZKP RepID Credentials — "privacy-preserving reputation that scales agent permissions"
- EIP-8004 — referenced as the protocol standard for the HyperDAG ledger
- hyperdag-protocol repo exists (Solidity, EIP-8004, Merkle DAG)
- hyperdag-platform repo exists (TypeScript, Multi-GNN, SDK)

Determine:
- Is hyperdag-protocol deployed to a testnet or mainnet?
- What is EIP-8004 exactly? Is this a real EIP or a proposed standard?
- Is trinity-w3c calling hyperdag-protocol contracts?
- Is the Merkle DAG audit trail actually recording agent decisions on-chain?
- Is ZKP proof generation happening in trinity-w3c or in a separate service?
- Does hyperdag-platform's Multi-GNN use the geometric mean aggregation from P-002? If yes, P-008 should be filed as a CIP to P-002, not as a standalone provisional.
- What is the RepID NFT structure? ERC-721? ERC-1155? Custom EIP-8004?
- Is the ZKP library circom, snarkjs, noir, or something else?
- What does `MASTER_ACCESS_KEY` govern?

**This section may reveal that P-008 is significantly more advanced than a "basic provisional" — if the Merkle DAG and ZKP are live, this could be the second most patent-ready filing in the portfolio.**

---

## Phase 7: Patent Evidence Audit — Scored

For each patent, score evidence readiness 0–100 based on actual system state.

### Scoring Rubric
- 0–25: Concept only, no implementation
- 26–50: Implementation exists, no production data
- 51–75: Production data exists, insufficient for SMED (< 30 days or incomplete)
- 76–90: SMED-ready with minor gaps
- 91–100: SMED-ready, attorney can file now

---

**P-001: AI Trinity Symphony — DEADLINE 8/6/2026**

| Claim | Agent | Evidence Source | Score | Gap |
|---|---|---|---|---|
| 3x3+3 murmuration coordination | trinity-orch | Supabase rotation logs | __ | |
| Golden ratio timing φ=1.618 | trinity-orch | Heartbeat/timing logs | __ | |
| RepID scoring distribution | trinity-veritas | RepID table | __ | |
| 82% cost reduction via ANFIS | py-brain | Routing cost comparison | __ | |
| 90% conflict elimination | trinity-shofet | BFT consensus logs | __ | |
| Theory-of-mind accuracy >50% | trinity-hdm | Prediction accuracy table | __ | |
| 18 LLM provider routing | all agents | ANFIS routing log | __ | |

**P-001 Overall Evidence Readiness: __ / 100**

---

**P-002: Multiplicative GNN — DEADLINE 8/17/2026**

| Claim | Agent | Evidence Source | Score | Gap |
|---|---|---|---|---|
| Geometric mean formula in production | py-brain | ANFIS computation log | __ | |
| O(log n) convergence vs O(n²) | py-brain | Convergence iteration count | __ | |
| Subjective logic gate active | trinity-shofet | Hallucination suppression log | __ | |
| 90% hallucination reduction | all agents | Hallucination rate table | __ | |
| n^1.5 MoE scaling | py-brain | Scaling metrics | __ | |

**P-002 Overall Evidence Readiness: __ / 100**

---

**P-003 New: Pythagorean Comma Veto — FILE THIS WEEK**

| Element | Status | Location in Code | Gap |
|---|---|---|---|
| Three-tier veto (Warning/Veto/Emergency) | | | |
| LLE calculation | | | |
| Integration with BFT | | | |
| Gap detection between agents | | | |

**P-003 Implementation Status: __ %**

---

**P-004: HIAS Human Intuition Accuracy Score — FILE THIS WEEK**

| Element | Status | Location in Code | Gap |
|---|---|---|---|
| Hunch taxonomy (8 categories) | | | |
| Confidence scoring 1–10 | | | |
| 0.85 promotion threshold | | | |
| HITL state machine | | | |
| Telegram data collection | | | |

**P-004 Implementation Status: __ %**

---

**P-005: Regime-Conditional ANFIS — Add to P-002**

| Element | Status | Location in Code | Gap |
|---|---|---|---|
| Regime detection (TRENDING/RANGING/CHAOTIC/SHOCK) | | | |
| LLE thresholds for regime transitions | | | |
| Weight adaptation logged per regime | | | |
| RQA entropy calculation | | | |

**P-005 Implementation Status: __ %**

---

**P-006: BFT Consensus + Hallucination Scoring — 30 Days**

| Element | Status | Location in Code | Gap |
|---|---|---|---|
| BFT algorithm in trinity-shofet | | | |
| EDM overlap thresholds | | | |
| Consensus threshold for 12-agent system | | | |
| Per-round agent votes logged | | | |

**P-006 Implementation Status: __ %**

---

**P-008: ZKP-NFT RepID — Basic Provisional This Week**

| Element | Status | Location in Code | Gap |
|---|---|---|---|
| ZKP proof generation (trinity-w3c) | | | |
| NFT RepID structure (ERC standard?) | | | |
| EIP-8004 implementation | | | |
| Merkle DAG audit trail | | | |
| hyperdag-protocol deployment status | | | |
| Stake-weighted voting | | | |

**P-008 Implementation Status: __ % — may be significantly higher than assumed**

---

**P-010: Harmonic Cycle Regime via FFT/CWT — CIP After Primaries**

| Element | Status | Location in Code | Gap |
|---|---|---|---|
| FFT/CWT computation | | | |
| LLE-modulated wisdom decay | | | |
| Harmonic convergence scores | | | |

**P-010 Implementation Status: __ %**

---

## Phase 8: Gap Analysis Tables

### Data Persistence Gap

For every patent-critical data type, confirm it persists to Supabase (not just Dragonfly/Redis):

| Data Type | Patent | Currently In | Persisted to Supabase? | Gap |
|---|---|---|---|---|
| ANFIS routing decisions | P-001, P-002 | py-brain / Dragonfly? | ? | |
| Agent RepID scores | P-001 | ? | ? | |
| BFT consensus votes | P-006 | trinity-shofet / ? | ? | |
| HITL hunch records | P-004 | Telegram / ? | ? | |
| LLM cost per call | P-001 | Dragonfly cache? | ? | |
| ZKP proofs | P-008 | On-chain / ? | ? | |
| Regime classifications | P-005 | py-brain / ? | ? | |

### Build Priority Matrix

| Item | Patent Impact | System Impact | Complexity | Priority |
|---|---|---|---|---|
| Persist ANFIS routing to Supabase | P-001, P-002 | Medium | Low | CRITICAL |
| HIAS scoring in trinity-chesed | P-004 | High | Medium | URGENT |
| Comma veto in trinity-shofet | P-003 new | Medium | Medium | URGENT |
| Regime-conditional weights in py-brain | P-005 | High | High | HIGH |
| BFT vote logging per round | P-006 | Low | Low | HIGH |
| ZKP proof persistence to Supabase | P-008 | Low | Low | HIGH |
| Theory-of-mind accuracy metric | P-001 | Medium | High | MEDIUM |

---

## Phase 9: 30-Day Sprint Plan

Week-by-week. Every item must serve both functionality AND patent evidence simultaneously.

### Week 1 (Days 1–7): Date-Lock & Data Persistence
**Goal:** File three provisionals this week; ensure all existing logs are persisting to Supabase

| Day | Action | Patent | Repo | Table(s) | Success Criteria |
|---|---|---|---|---|---|
| 1 | Audit Dragonfly/Redis → identify ephemeral patent data | P-001, P-002 | trinity-ecosystem | — | Full list of data not in Supabase |
| 1-2 | Draft Pythagorean Comma provisional spec | P-003 new | — | — | 20-page spec ready for USPTO |
| 1-2 | Draft HIAS provisional spec | P-004 | — | — | 20-page spec ready for USPTO |
| 2-3 | Draft ZKP-NFT skeleton provisional | P-008 | — | — | 15-page spec ready for USPTO |
| 3 | Add Supabase write for ANFIS routing decisions | P-001, P-002 | trinity-ecosystem | (discover name) | Every routing decision logged with provider, cost, outcome |
| 4 | Add Supabase write for BFT consensus votes | P-006 | trinity-symphony-shared | (discover name) | Every consensus round logged with individual agent votes |
| 5 | File three provisionals via USPTO Patent Center | P-003, P-004, P-008 | — | — | USPTO confirmation numbers received |
| 6-7 | Add HIAS score field to HITL workflow | P-004 | trinity-symphony-shared | (discover name) | First HIAS scores appearing in Supabase |

### Week 2 (Days 8–14): Evidence Collection Begins
**Goal:** Start the 30-day evidence clock for SMED declarations

| Action | Patent | System Benefit | Success Criteria |
|---|---|---|---|
| Implement regime detection in py-brain (4 regimes) | P-005 | Better routing accuracy | Regime logged per cycle with LLE value |
| Add cost comparison baseline to ANFIS log | P-001, P-002 | Proves cost savings | Before/after cost logged per routing decision |
| Implement Pythagorean Comma gap detection in trinity-shofet | P-003 new | Improves consensus quality | Gap severity score logged per BFT round |
| Confirm ZKP proof generation is writing to Supabase | P-008 | Audit trail completeness | ZKP proofs appearing in Supabase with timestamps |

### Week 3 (Days 15–21): Deepen & Validate
**Goal:** 15 days of clean data; begin drafting attorney materials

| Action | Patent | Success Criteria |
|---|---|---|
| RepID score distribution analysis | P-001 | Distribution showing learning over time |
| Theory-of-mind accuracy metric | P-001 | >50% logged per agent per cycle |
| Harmonic cycle regime via FFT (if py-brain has data) | P-010 | First harmonic scores in Supabase |
| Begin attorney engagement — send Patent Strategy v2.0 doc | All | Attorney confirms availability for April drafting |

### Week 4 (Days 22–30): SMED Preparation
**Goal:** 30 days of data; prepare SMED declaration materials

| Action | Patent | Deliverable |
|---|---|---|
| Run verification script — full patent evidence scorecard | All | Readiness scores updated |
| Export ANFIS routing cost comparison data | P-001, P-002 | Table showing 82% cost reduction with baseline |
| Export BFT consensus round logs | P-006 | Table showing consensus outcomes with votes |
| Export HIAS score evolution | P-004 | Score distribution over 30 days |
| Draft SMED declaration with actual metrics | P-001, P-002 | Fillable declaration ready for attorney |

---

## Phase 10: Verification Script

Write TypeScript that runs nightly as a Railway cron job.

**Rules:**
- Discover schema from information_schema first — no hardcoded table names
- Check all three data stores: Supabase, Dragonfly (if accessible), Upstash Redis
- For Supabase: row counts, date ranges, write frequency, null rates
- For Railway agents: last heartbeat in Supabase
- Output: Patent Evidence Report + SMED-ready JSON export

```typescript
// TEMPLATE — implement against actual discovered schema

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const PATENT_RELEVANT_KEYWORDS = [
  'anfis', 'routing', 'consensus', 'repid', 'hias', 'hunch',
  'comma', 'veto', 'bft', 'regime', 'harmonic', 'cascade',
  'beneficiary', 'zkp', 'nft', 'dag', 'hallucination',
  'convergence', 'murmuration', 'conductor', 'cost_comparison'
]

async function runPatentVerification() {

  // Step 1: Discover actual schema
  const { data: tables } = await supabase.rpc('get_table_stats')
  // Implement get_table_stats as a Supabase function querying pg_stat_user_tables

  // Step 2: Classify tables
  const patentTables = tables?.filter(t =>
    PATENT_RELEVANT_KEYWORDS.some(k => t.tablename.toLowerCase().includes(k))
  )

  // Step 3: Check agent heartbeats
  // Query heartbeat table (discover actual name) for each of 12 agents

  // Step 4: Score patent evidence per filing
  const scores = {
    P001_trinity: await scorePatent('P001', ['anfis', 'routing', 'repid', 'conductor', 'murmuration']),
    P002_gnn: await scorePatent('P002', ['anfis', 'convergence', 'hallucination', 'geometric']),
    P003_comma: await scorePatent('P003_comma', ['comma', 'veto', 'gap']),
    P004_hias: await scorePatent('P004', ['hias', 'hunch', 'hitl']),
    P005_anfis: await scorePatent('P005', ['regime', 'anfis', 'weight']),
    P006_bft: await scorePatent('P006', ['consensus', 'bft', 'vote']),
    P008_zkp: await scorePatent('P008', ['zkp', 'nft', 'dag', 'repid']),
    P010_harmonic: await scorePatent('P010', ['harmonic', 'fft', 'cwt', 'regime']),
  }

  // Step 5: Export SMED JSON
  const smedReport = {
    generated_at: new Date().toISOString(),
    system: 'AITrinitySymphony',
    inventor: 'Sean Patrick Goodwin',
    railway_agents: 12,
    supabase_tables_total: tables?.length || 0,
    supabase_tables_with_data: tables?.filter(t => t.n_live_tup > 0).length || 0,
    patent_evidence_scores: scores,
    zero_row_patent_tables: patentTables?.filter(t => t.n_live_tup === 0).map(t => t.tablename),
    data_date_range: {
      earliest: null, // populate from queries
      latest: null,
      days_of_data: 0,
      smed_ready: false // true when days_of_data >= 30
    },
    agent_health: {
      trinity_orch: null,
      trinity_w3c: null,
      trinity_shofet: null,
      trinity_torch: null,
      trinity_veritas: null,
      trinity_gcm: null,
      trinity_chesed: null,
      trinity_mel: null,
      trinity_apm: null,
      trinity_sophia: null,
      trinity_nexus: null,
      trinity_hdm: null,
    }
  }

  return smedReport
}

async function scorePatent(patentId: string, keywords: string[]): Promise<{score: number, gaps: string[]}> {
  // Find tables matching keywords
  // Check row counts and date ranges
  // Return score 0-100 and list of gaps
  return { score: 0, gaps: [] }
}
```

---

## Deliverables — In This Order

1. **Architecture Reality Map** — 3x3+3 with confirmed roles from actual code, not assumptions
2. **Three-Tier Data Map** — what's in Supabase vs Dragonfly vs Upstash Redis, and which patent-critical data is not persisted
3. **276-Table Classification** — all tables grouped by function, row counts, activity status
4. **Web3/DAG/DAO Honest Status** — actual state of hyperdag-protocol and trinity-w3c, including whether EIP-8004 is live
5. **Patent Evidence Scorecard** — 0–100 per patent with specific gaps and tables
6. **30-Day Sprint Plan** — week by week, every item serves both functionality and patent evidence
7. **Critical Path to August** — work backwards from SMED declaration deadlines
8. **Verification Script** — complete TypeScript, schema-first, Railway cron
9. **SMED Declaration Template** — December 2025 USPTO format, fields mapped to actual table names discovered in this session

---

## Operating Rules

- Query actual schema before writing any SQL or referencing table/column names
- Never reference "19 tables" — actual count is 276
- Never reference "8 agents" — actual count is 12 in 3x3+3 architecture
- System is live with 281,100 daily REST requests — treat as production
- Do not simplify or remove any existing code without explicit permission
- Efficiency over engagement — shortest path to verified results
- When uncertain about a component's role, read the actual .js file
- All patent evidence must be verifiable from Supabase persistent data, not from Dragonfly/Redis cache
- Never output actual values of any environment variable — reference by name only
- Build order must serve both system functionality AND patent evidence simultaneously

---

## Patent Deadline Reference

| Patent | Provisional Filed | Conversion Deadline | Filing Type | Status |
|---|---|---|---|---|
| P-001: AI Trinity Symphony | 8/6/2025 | **8/6/2026** | Non-provisional | Pending |
| P-002: Multiplicative GNN | 8/17/2025 | **8/17/2026** | Non-provisional | Pending |
| P-003 QDR: Question-Driven Reality | 8/21/2025 | **8/21/2026** | Non-provisional CIP | Pending |
| P-003 New: Pythagorean Comma Veto | **File this week** | TBD | New provisional | URGENT |
| P-004: HIAS | **File this week** | TBD | New provisional | URGENT |
| P-008: ZKP-NFT skeleton | **File this week** | TBD | New provisional | URGENT |
| P-006: BFT Consensus | Within 30 days | TBD | New provisional | HIGH |

---

*HyperDAG | Sean Patrick Goodwin | March 2026*
*Philippians 4:8 | Micah 6:8 | Matthew 7:12*
*CONFIDENTIAL*
