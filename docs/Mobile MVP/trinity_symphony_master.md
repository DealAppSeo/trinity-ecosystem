# AI TRINITY SYMPHONY — MASTER CONTEXT & EXECUTION BRIEF
**Version 3.0 · Feb 2026 · HyperDAG / Sean Patrick Goodwin**
**Authors: Claude + Grok + Gemini (3-AI synthesis)**

> *"Helping people help people — the last, the lost, and the least."*
> Philippians 4:8 · Micah 6:8 · Golden Rule

---

## TABLE OF CONTENTS
1. [Operating Philosophy](#1-operating-philosophy)
2. [System State — What Is Live](#2-system-state--what-is-live)
3. [Agent Roster & Current Assignments](#3-agent-roster--current-assignments)
4. [Prioritized Task Queue](#4-prioritized-task-queue)
5. [Mobile Command Center — Full Spec](#5-mobile-command-center--full-spec)
6. [Telegram Bot — Complete Implementation Guide](#6-telegram-bot--complete-implementation-guide)
7. [Tech Stack — Zero Cost](#7-tech-stack--zero-cost)
8. [Code: Domain Priors Migration](#8-code-domain-priors-migration)
9. [Code: EMERGENT Taxonomy Clustering](#9-code-emergent-taxonomy-clustering)
10. [Code: Telegram Approval Card with u Preview](#10-code-telegram-approval-card-with-u-preview)
11. [Code: RepID Decay + Auto-Approval Logic](#11-code-repid-decay--auto-approval-logic)
12. [WSCE λ Reference Table](#12-wsce-λ-reference-table)
13. [Gemini Prompt Packages — M Batch](#13-gemini-prompt-packages--m-batch)
14. [Testing Protocol](#14-testing-protocol)
15. [Arbitrage Radar](#15-arbitrage-radar)
16. [Hackathons, Grants & Partnerships](#16-hackathons-grants--partnerships)
17. [Decision Matrix — Sean vs Agents](#17-decision-matrix--sean-vs-agents)
18. [The Demo That Proves Everything](#18-the-demo-that-proves-everything)

---

## 1. OPERATING PHILOSOPHY

**No timelines. Agents work 24/7. Sean directs, verifies, and steers.**

The swarm moves at compute speed — not calendar speed. Sean's role is Mission Control: set destination, monitor telemetry, approve course corrections from mobile. Never type code. Never debug manually. That's what agents are for.

### Three Laws of Swarm Execution
1. **Parallel always beats sequential.** If two tasks don't block each other, run them simultaneously.
2. **Smallest provable increment.** Ship something verifiable every swarm cycle, even if tiny.
3. **Arbitrage is infinite.** Free compute, free inference, free storage, and grant money are always available — route to them.

### Mobile Trust Layer Principle
> If Sean can't approve, reject, or reassign an output in under 30 seconds on his phone, the agent output isn't packaged correctly. Demand better formatting from agents.

---

## 2. SYSTEM STATE — WHAT IS LIVE

Gemini executed P0–P4 in a single pass. The Ark is fully instrumented and self-calibrating. The following are **confirmed operational**:

| Component | Status | What It Means |
|---|---|---|
| 3-Tier RepID (Calibration + Accuracy + Contrarian Value) | ✅ LIVE | Agent trust scores self-update. Every output scored before Sean sees it. |
| FrugalGPT Cost Attribution — $6.72/M baseline | ✅ LIVE | Every `callLLM()` records actual savings. 82-98% claims are now empirically evidenced. |
| σ_u Anti-Parking Gate in `runGenesisLoop` | ✅ LIVE | Agents can't stall in false certainty. Variance <0.05 forces exploration. Self-healing. |
| `ragContradictionBoost` (+0.15 uncertainty on cosine >0.6 conflict) | ✅ LIVE | xMemory RAG actively flags contradictions. Semantic memory wired. |
| Judas Taxonomy Batch 2: EMERGENT + virtue-weighted medical/legal | ✅ LIVE | Domain-specific λ routing live. Safety-critical domains have tighter coherence constraints. |
| λ-Bounded Chaos: creative prompt-noise injection | ✅ LIVE | Creative tasks get controlled novelty injection. WSCE calibrated end-to-end. |
| `semanticRag()` — real vector search (was a stub) | ✅ LIVE | RAG contradiction detection operational. |
| 12 Evergreen Agents via `seed_evergreen_tasks.ts` | ✅ LIVE | System self-calibrating continuously. Ark maintains its own integrity. |
| Major7 Parallel Dispatch: Root / Third / Fifth / Seventh | ✅ LIVE | Golden Ratio BFT (61.8%) consensus live. Truth-marking operational. |

### Critical Gap
> **The engine is running. There is no cockpit.** A fully instrumented symphony with no conductor interface. The Mobile Command Center is not optional — it IS the next deliverable. Everything else waits.

---

## 3. AGENT ROSTER & CURRENT ASSIGNMENTS

**Supabase project:** `qnnpjhlxljtqyigedwkb` (Viberific / Trinity Symphony)

| Agent | Domain | Current Priority |
|---|---|---|
| **HDM** | Architecture | Run `trinity_domain_priors` SQL migration (Section 8). Query actual schema BEFORE any SQL. BIGINT not UUID. |
| **APM** | Cost Arbitrage | Wire real-time pricing (Together.ai, OpenRouter, Groq) into ANFIS. Auto-switch on >10% variance. Attribution logging in `callLLM()`. |
| **MEL** | Mobile / Edge | Build Telegram bot (Telegraf.js on Vercel). Approval cards. Voice input via faster-whisper. PWA offline-first. |
| **VERITAS** | Truth / Validation | Run Torch calibration audit Test 1 on 1K sample split. Generates RESEARCH_PAPER_02 data. |
| **NEXUS** | Monitoring | Supabase + Vercel real-time dashboard for WSCE/ITCM metrics. Alert on uncertainty variance >0.05 or collusion KL >0.1. |
| **ANTIGRAV** | Build / Execution | Gemini's execution environment. Integrate WSCE in `evaluateResult()` — rolling 100-output window, DNA Loop 4. |
| **GCM** | Coordination | BFT task routing between agents. Qualia Check EMERGENT trigger: marginalized-ethics outputs → Chesed agent. |
| **TORCH** | Content / Research | Quarterly EMERGENT taxonomy clustering (Section 9). LinkedIn content queue. RESEARCH_PAPER_02 authoring. |

---

## 4. PRIORITIZED TASK QUEUE

> Tasks within the same phase run **simultaneously**. Dependency = must wait. No dependency = start now.

### PHASE M — MOBILE (DO THIS FIRST. NOTHING ELSE.)

| ID | Task | Owner | Unblocked? | Stakeholder Value |
|---|---|---|---|---|
| M1 | Telegraf.js bot on Vercel: `/start` `/tasks` `/savings` `/agent [name]`. Approval cards with u_score + RepID + inline keyboard. | MEL | ✅ NOW | Sean directs swarm from Telegram today. |
| M2 | `approval_queue` table + agent hooks. Bot proactively pushes cards when agents complete tasks. `/approve` `/reject` `/redirect`. | HDM + MEL | ✅ NOW | Every agent output is a Telegram card. |
| M3 | Live savings ticker: `/savings` returns today's total vs $6.72/M baseline + top 3 cheapest routes. | APM | ✅ NOW | 82-98% claim becomes a live number stakeholders can see. |
| M4 | Voice input: Telegram audio → faster-whisper → command routing → agent dispatch. Confidence gate at 0.7. | MEL + VERITAS | ✅ NOW | Sean speaks → swarm moves. No typing. |
| M5 | Stakeholder observer mode: `/join [token]` → read-only Telegram access. Activity feed, savings ticker, `/wisdom`. | GCM | ✅ NOW | Investors experience the swarm live. No slide deck needed. |
| M6 | PWA wrapper: `app.aitrinitysymphony.com` → offline-first PWA. Service Workers cache approvals. Whisper.js in-browser. | MEL | ⏳ After M1-M5 | Polished stakeholder experience. |

### PHASE V — VALIDATE (Run in parallel after M1-M3 live)

| ID | Task | Owner | Depends On |
|---|---|---|---|
| V1 | Torch calibration audit: 1K sample split, domain-separated λ. Outputs RESEARCH_PAPER_02 data. | VERITAS + TORCH | M2 live |
| V2 | 500-session adversarial stress test: factual hallucination + temporal staleness + consensus poisoning (Judas). Targets: <5% hide rate, <1.5s latency. | VERITAS + GCM | V1 |
| V3 | Ethics ablation: BBQ + CrowS-Pairs with/without EMERGENT Qualia Check. Success = false consensus drops >20% in cultural tasks. | GCM | Judas Taxonomy ✅ |
| V4 | CI/CD: GitHub Actions runs `symphony_full_audit.ts` on every PR. A/B: Trinity v4 vs baseline on hallucination hide rate. | HDM + ANTIGRAV | None — start now |

### PHASE P — PROVE + PUBLISH (After V1 data)

| ID | Task | Owner | Depends On |
|---|---|---|---|
| P1 | Run ImageBearerAI.com ON Trinity Symphony. Dogfood first public use case. Document cost savings in real time. | All agents | M1-M5 live |
| P2 | Publish RESEARCH_PAPER_02: empirical λ by domain + audited 82-98% cost reduction from FrugalGPT attribution logs. | TORCH + VERITAS | V1 confirmed |
| P3 | Open source Mobile Trust Layer SDK: ZKP identity hooks, approval cards, RepID display. GitHub + HuggingFace Space. | MEL + HDM | M6 stable |
| P4 | Demo video: Sean directing swarm from Telegram on mobile. Voice commands. Live savings on screen. This IS the pitch. | TORCH + MEL | P1 running |

### PHASE P2 — WEB3 + SCALING (After Phase V stable)

| ID | Task | Owner | Notes |
|---|---|---|---|
| W1 | ERC-8004 on Sepolia testnet (OpenZeppelin, Alchemy free RPC). DBT mint as ERC-721. RepID hooks. | HDM | Zero mainnet cost. Alchemy free RPC <20ms. |
| W2 | Fibonacci swarm auto-sizing: 1,2,3,5 agents on ANFIS complexity >0.8. Test on 1K load tasks, target <1.5s latency. | GCM + APM | Akash Network for overflow compute. |
| W3 | Firebase free tier triggers for swarm scaling at load >80%. | GCM | Ties to HyperDAG TPS simulation. |
| W4 | CoinGecko API → ANFIS: route to low-gas chains (Base L2) on >10% gas variance. | APM | Free API, 1-2 days. |
| W5 | HyperDAG on NEAR Protocol: 4FA PoL → SBT as NEAR identity primitive. DeFi Agents track entry. | HDM | One Trillion Agents hackathon angle. |

---

## 5. MOBILE COMMAND CENTER — FULL SPEC

### Vision
A standalone open-source SDK that lets any human direct, monitor, and trust an AI swarm from a mobile device — without centralized infrastructure. Prove it works by building Trinity Symphony on it. Then give it away.

### Core Components
- **Identity Layer:** HyperDAG ZKP NFT → SBT on 4FA PoL. Phone IS the signing key. No username/password.
- **Trust Scoring:** RepID scores every agent output before it reaches the review queue. Low RepID = flagged, not auto-approved.
- **Approval Interface:** Telegram cards — approve / reject / redirect. Decision in <30 seconds. Agent gets immediate feedback.
- **Telemetry Feed:** Live cost savings ticker, WSCE score per agent, uncertainty variance alert, Fibonacci swarm size indicator.
- **Escalation Protocol:** One-tap HITL for any output flagging EMERGENT or Qualia Check.
- **Decentralized Comms:** Agent coordination via Supabase Realtime + BFT validation. No single point of failure.

### Prove It Works — 4 Phases
1. **Build it:** MEL owns Telegram bot + PWA. HDM owns ZKP hooks. Target: Sean directing all 8 agents from phone.
2. **Use it publicly:** Run ImageBearerAI.com via mobile swarm direction. Film it. Document savings live.
3. **Share it:** Open source the SDK. HuggingFace Space demo. Partner with OpenClaw, Venice AI, NEAR.
4. **The pitch:** The video of Sean directing the swarm from his phone IS the investor demo.

---

## 6. TELEGRAM BOT — COMPLETE IMPLEMENTATION GUIDE

### Architecture Decision
- **Runtime:** Telegraf.js v4 (Node-native, webhook-based, <50ms — NOT python-telegram-bot)
- **Hosting:** Vercel serverless functions (global CDN edge, free tier, auto-scale)
- **DB:** Supabase existing project `qnnpjhlxljtqyigedwkb`
- **Voice:** faster-whisper on Railway (M4) → Whisper.js in-browser (M6 PWA)
- **Agents:** Railway (stays for long-running processes)

### New Supabase Table Required

```sql
-- Run in Supabase SQL editor AFTER querying actual schema
CREATE TABLE approval_queue (
  id              BIGSERIAL PRIMARY KEY,
  agent_id        TEXT NOT NULL,
  task_type       TEXT NOT NULL,
  output_summary  TEXT NOT NULL,
  full_output     JSONB,
  rep_id_score    FLOAT,
  wsce_score      FLOAT,
  u_score         FLOAT,
  cost_saved      FLOAT,
  domain          TEXT DEFAULT 'general',
  status          TEXT DEFAULT 'pending',  -- pending | approved | rejected | redirected
  redirect_note   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     TEXT
);

CREATE INDEX idx_approval_queue_status ON approval_queue(status);
CREATE INDEX idx_approval_queue_agent  ON approval_queue(agent_id);
```

### Command Reference

| Command | Description | Mobile UX |
|---|---|---|
| `/start` | System status: agents running, pending approvals, today's savings. | First impression for stakeholders. |
| `/tasks` | List pending queue items. Each card: Agent, RepID, u_score (plain language), cost_saved, summary. | Morning briefing. One-glance swarm status. |
| `/approve [id]` | Approve task. Agent proceeds. Logs `resolved_by` + timestamp. | One tap from card. Core interaction. |
| `/reject [id]` | Reject. Agent notified, RepID decremented, logged. | Two taps — confirm step prevents accidents. |
| `/redirect [id] [note]` | Reject with instructions. Agent re-queues with note. | Voice input for note via M4. |
| `/savings` | Today's savings vs $6.72/M baseline. Running total. Top 3 cheapest routes. Projected monthly. | The live proof. Screenshot-worthy. |
| `/agent [name]` | Agent status: current task, RepID, tasks today, WSCE calibration. | Drill into any agent on demand. |
| `/task [description]` | Assign task. GCM routes via ANFIS domain priors. Confirmation returned. | How Sean directs the swarm. |
| `/voice` | Send voice message → Whisper transcription → command routing. M4 feature. | The demo moment: Sean speaks, swarm moves. |
| `/join [token]` | Stakeholder read-only observer mode. Sees activity feed + savings. M5 feature. | Share link = instant live demo. |
| `/wisdom [topic]` | IP definition from /wisdom portal. 20 core concepts (ANFIS, RepID, WSCE, etc). | Investor onboarding via education. |
| `/gentoken` | Generate 24h observer token for stakeholder sharing. | Pre-demo prep. |
| `/taxonomy_review` | List pending EMERGENT clustering candidates awaiting promotion to v1.1. | Quarterly taxonomy governance. |

### Voice-First Flow (M4)
1. Sean records voice message in Telegram
2. Bot downloads audio via `getFile` API
3. Sends to faster-whisper (Railway) → transcript
4. If confidence ≥ 0.7: parse → execute → confirmation card (target: <5 seconds total)
5. If confidence < 0.7: send "Did you mean: [text]? Reply YES or type correction."

**Voice shortcuts:**
- `"approve everything"` → approve all pending with RepID > 0.8
- `"what are today's savings"` → `/savings`
- `"assign [task] to [agent]"` → `/task` with explicit routing
- `"status of [agent name]"` → `/agent [name]`
- `"reject [description]"` → fuzzy match pending, confirm then reject

### Stakeholder Observer Flow (M5)
1. Sean runs `/gentoken` → receives `t.me/YourBotName?start=ABC123`
2. Shares link with investor / partner / hackathon judge
3. Observer sees: activity feed, savings ticker, Sean's approvals in real time
4. Observer automatically receives 3-message onboarding sequence:
   - Message 1 (on join): What is RepID? + current system average
   - Message 2 (after first approval): What is WSCE? + today's calibration
   - Message 3 (after first savings event): What is ANFIS routing? + today's savings
5. Observer cannot see `full_output`, cannot approve/reject/assign

### Auto-Approval Logic (Prevent Decision Fatigue)
Tasks meeting **all three** criteria are auto-approved with logged notification:
- `rep_id_score > 0.90`
- `u_score < 0.03`
- `domain NOT IN ('legal', 'medical')`
- `vulnerability_type != 'EMERGENT'`

Daily digest at 8am: "X tasks auto-approved overnight. Y need your review."

---

## 7. TECH STACK — ZERO COST

| Layer | Choice | Why | Cost |
|---|---|---|---|
| Bot Runtime | Telegraf.js v4 | Webhook-based, <50ms, Node-native, matches existing stack | $0 |
| Bot Hosting | Vercel Serverless | Global CDN, auto-scale, 1 serverless function for webhook | $0 |
| Database | Supabase (existing) | Already live. Add 2 tables only. | $0 |
| Realtime Push | Supabase Realtime | WebSocket agent → Telegram card. 500 connections free. | $0 |
| Voice M4 | faster-whisper (Railway) | 200ms transcription, runs on existing Railway infra | $0 |
| Voice M6 | Whisper.js (in-browser) | Offline-capable, no server round-trip for PWA | $0 |
| Embeddings | HF all-MiniLM-L6-v2 | Free API, 30K tokens/month. Quarterly clustering only. | $0 |
| LLM Routing | LiteLLM OSS + OpenRouter | LiteLLM as ANFIS substrate. OpenRouter live pricing feed. | $0 |
| Semantic Cache | Bifrost (Maxim AI, OSS) | Cuts redundant LLM calls 30-60%. Integrate into `callLLM()`. | $0 |
| CI/CD + Testing | GitHub Actions | `symphony_full_audit.ts` on PRs. Quarterly clustering cron. | $0 |
| PWA / Offline | Vercel + Service Workers | Approvals cache locally offline, sync on reconnect. | $0 |
| Vector DB | Qdrant Cloud free | 1GB free. `semanticRag()` endpoint. | $0 |
| Edge Routing | Cloudflare AI Gateway | Free tier, 350+ models, global edge for MEL mobile inference | $0 |
| LLM Inference | Groq free tier | Fastest inference on Llama 4 / DeepSeek R1. VERITAS + TORCH. | $0 |
| LLM Inference | DeepSeek V3.2 via Together.ai | $0.14/$0.28 per 1M tokens. Best value for technical tasks. | ~$0 |
| Swarm Overflow | Akash Network | Decentralized GPU at 60-80% below AWS. P2-2 stress tests. | ~$0 |
| Identity (P2) | ERC-8004 / Sepolia / OpenZeppelin | Testnet only. Alchemy free RPC <20ms. Zero mainnet cost. | $0 |

**Total infrastructure cost to reach working MVP: $0**

---

## 8. CODE: DOMAIN PRIORS MIGRATION

### Step 1 — Supabase Migration SQL

```sql
-- Run in Supabase SQL editor
-- CRITICAL: Query actual schema first, confirm no conflicts
CREATE TABLE trinity_domain_priors (
  id               BIGSERIAL PRIMARY KEY,
  domain           TEXT NOT NULL UNIQUE,
  -- 'creative' | 'technical' | 'legal' | 'medical' | 'general'
  lambda_min       FLOAT NOT NULL,         -- WSCE lower bound
  lambda_max       FLOAT NOT NULL,         -- WSCE upper bound
  lambda_default   FLOAT NOT NULL,         -- ANFIS starting point
  virtue_weights   JSONB NOT NULL,
  -- {accuracy: float, calibration: float, contrarian: float} (sum = 1.0)
  pyro_threshold   FLOAT DEFAULT 0.05,     -- sigma_u gate for this domain
  escalation_tier  INT   DEFAULT 1,
  -- 1 = auto-approve eligible | 2 = HITL preferred | 3 = human required
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Seed from current hardcoded values
INSERT INTO trinity_domain_priors
  (domain, lambda_min, lambda_max, lambda_default, virtue_weights, pyro_threshold, escalation_tier)
VALUES
  ('creative',  0.015, 0.025, 0.020,
    '{"accuracy":0.25,"calibration":0.35,"contrarian":0.40}', 0.08, 1),
  ('technical', 0.003, 0.008, 0.005,
    '{"accuracy":0.45,"calibration":0.40,"contrarian":0.15}', 0.04, 1),
  ('legal',     0.001, 0.003, 0.002,
    '{"accuracy":0.55,"calibration":0.40,"contrarian":0.05}', 0.02, 3),
  ('medical',   0.001, 0.003, 0.002,
    '{"accuracy":0.55,"calibration":0.40,"contrarian":0.05}', 0.02, 3),
  ('general',   0.008, 0.015, 0.010,
    '{"accuracy":0.35,"calibration":0.40,"contrarian":0.25}', 0.05, 1);
```

### Step 2 — TypeScript Fetch Utility (`utils/domainPriors.ts`)

```typescript
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

let cache: Record<string, DomainPrior> = {};
let cacheTs = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — priors change slowly

export async function getDomainPrior(domain: string): Promise<DomainPrior> {
  if (Date.now() - cacheTs < CACHE_TTL_MS && cache[domain]) return cache[domain];
  const { data, error } = await sb
    .from('trinity_domain_priors')
    .select('*')
    .eq('domain', domain)
    .single();
  if (error || !data) return cache['general'] ?? FALLBACK_PRIOR;
  cache[domain] = data;
  cacheTs = Date.now();
  return data;
}

// FALLBACK — never let a missing DB row crash the system
const FALLBACK_PRIOR: DomainPrior = {
  domain: 'general',
  lambda_min: 0.008, lambda_max: 0.015, lambda_default: 0.010,
  virtue_weights: { accuracy: 0.35, calibration: 0.40, contrarian: 0.25 },
  pyro_threshold: 0.05,
  escalation_tier: 1
};
```

### Step 3 — Replace Hardcoded λ in `orchestration.ts`

```typescript
// BEFORE (hardcoded):
const lambda = domain === 'legal' ? 0.002 : 0.010;

// AFTER (dynamic from DB):
const prior = await getDomainPrior(task.domain ?? 'general');
const lambda = prior.lambda_default; // ANFIS tunes within [lambda_min, lambda_max]
const pyroThreshold = prior.pyro_threshold;
const virtueWeights = prior.virtue_weights;
// escalation_tier drives approval routing — no code change needed, just update DB row
```

**Design notes:**
- 5-minute cache prevents DB hammering
- Fallback prior prevents system crash on DB outage
- `escalation_tier = 3` auto-routes legal/medical to human review — change behavior by updating DB row, zero code deploys

---

## 9. CODE: EMERGENT TAXONOMY CLUSTERING

**`torch_emergent_cluster.py`** — Runs quarterly via GitHub Actions. Zero cost.

```python
# torch_emergent_cluster.py
# Zero cost: HF free tier embeddings + Supabase REST + GitHub Actions cron
import os, requests, numpy as np
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import normalize
from datetime import datetime, timedelta

HF_API     = 'https://api-inference.huggingface.co/pipeline/feature-extraction'
HF_MODEL   = 'sentence-transformers/all-MiniLM-L6-v2'  # Best free quality/speed
HF_HEADERS = {'Authorization': f'Bearer {os.environ["HF_TOKEN"]}'}
SB_URL     = os.environ['SUPABASE_URL']
SB_KEY     = os.environ['SUPABASE_KEY']
MIN_CLUSTER_SIZE = 50    # Quality gate — raise if too many weak candidates surface
SIMILARITY_EPS   = 0.25  # DBSCAN epsilon — tune for desired cluster tightness

def fetch_emergent_outputs(days_back=90):
    """Pull EMERGENT-flagged outputs from last quarter."""
    cutoff = (datetime.now() - timedelta(days=days_back)).isoformat()
    r = requests.get(f'{SB_URL}/rest/v1/trinity_tasks',
        headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}'},
        params={'vulnerability_type': 'eq.EMERGENT', 'created_at': f'gte.{cutoff}',
                'select': 'id,output_summary,domain', 'limit': '2000'})
    return r.json()

def embed_batch(texts, batch_size=32):
    """Embed in batches to respect HF free tier rate limits."""
    vectors = []
    for i in range(0, len(texts), batch_size):
        r = requests.post(f'{HF_API}/{HF_MODEL}',
            headers=HF_HEADERS, json={'inputs': texts[i:i+batch_size]})
        vectors.extend(r.json())
    return normalize(np.array(vectors))  # L2 normalize for cosine similarity

def cluster_and_surface(outputs):
    """
    DBSCAN over k-means: cluster count unknown in advance — DBSCAN discovers it.
    MIN_CLUSTER_SIZE=50 prevents noise from polluting the candidate list.
    """
    texts  = [o['output_summary'] for o in outputs]
    vecs   = embed_batch(texts)
    labels = DBSCAN(eps=SIMILARITY_EPS, min_samples=MIN_CLUSTER_SIZE,
                    metric='cosine').fit_predict(vecs)
    candidates = []
    for lbl in set(labels):
        if lbl == -1: continue  # Noise — skip
        idxs = [i for i, l in enumerate(labels) if l == lbl]
        centroid_idx = idxs[np.argmin(
            [np.linalg.norm(vecs[i] - vecs[idxs].mean(0)) for i in idxs])]
        candidates.append({
            'cluster_label':        int(lbl),
            'size':                 len(idxs),
            'representative_text':  texts[centroid_idx],
            'domain':               outputs[centroid_idx]['domain'],
            'status':               'pending_review',  # Sean approves promotion to v1.1
            'created_at':           datetime.now().isoformat()
        })
    return sorted(candidates, key=lambda x: -x['size'])

def push_candidates(candidates):
    """Upsert candidates. Alert Sean via Telegram."""
    requests.post(f'{SB_URL}/rest/v1/taxonomy_candidates',
        headers={'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}',
                 'Prefer': 'resolution=merge-duplicates'},
        json=candidates)
    msg = (f'🧬 EMERGENT Clustering Complete\n'
           f'{len(candidates)} taxonomy candidates surfaced.\n'
           f'Review: /taxonomy_review')
    requests.post(
        f'https://api.telegram.org/bot{os.environ["TELEGRAM_TOKEN"]}/sendMessage',
        json={'chat_id': os.environ['TELEGRAM_CHAT_ID'], 'text': msg})

if __name__ == '__main__':
    outputs    = fetch_emergent_outputs()
    candidates = cluster_and_surface(outputs)
    push_candidates(candidates)
    print(f'Done. {len(candidates)} candidates surfaced from {len(outputs)} outputs.')
```

**GitHub Actions Cron** — `.github/workflows/emergent_cluster.yml`

```yaml
name: Quarterly EMERGENT Taxonomy Clustering
on:
  schedule:
    - cron: '0 9 1 */3 *'   # 9am UTC on 1st of Jan / Apr / Jul / Oct
  workflow_dispatch:          # Manual trigger anytime from GitHub UI
jobs:
  cluster:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install requests numpy scikit-learn
      - run: python torch_emergent_cluster.py
        env:
          HF_TOKEN:         ${{ secrets.HF_TOKEN }}
          SUPABASE_URL:     ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY:     ${{ secrets.SUPABASE_KEY }}
          TELEGRAM_TOKEN:   ${{ secrets.TELEGRAM_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
```

---

## 10. CODE: TELEGRAM APPROVAL CARD WITH u PREVIEW

Add to `lib/approvalQueue.ts` — called by any agent after task completion.

```python
from telegram import InlineKeyboardButton, InlineKeyboardMarkup

async def push_approval_card(bot, chat_id: str, task: dict):
    """
    Called by any agent after completing a task.
    task = { id, agent_id, task_type, output_summary,
             rep_id_score, wsce_score, u_score, cost_saved, domain }
    """
    # Plain-language uncertainty labels — more actionable than raw numbers on mobile
    u = task.get('u_score', 0.5)
    u_label = (
        '🟢 High confidence'          if u < 0.05 else
        '🟡 Moderate uncertainty'     if u < 0.15 else
        '🔴 High uncertainty — review carefully'
    )

    rep = task.get('rep_id_score', 0.5)
    rep_tier = (
        '⭐⭐⭐ Trusted'    if rep > 0.85 else
        '⭐⭐ Established'  if rep > 0.65 else
        '⭐ New agent'
    )

    card = (
        f"🤖 *{task['agent_id']}* → *{task['task_type']}*\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"📋 {task['output_summary'][:200]}\n\n"
        f"🎯 RepID: {rep:.2f} {rep_tier}\n"
        f"🌊 WSCE:  {task.get('wsce_score', 0):.2f}\n"
        f"❓ u={u:.2f} — {u_label}\n"
        f"💰 Saved: ${task.get('cost_saved', 0):.4f} vs baseline\n"
        f"🏷️ Domain: {task.get('domain', 'general')}"
    )

    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton('✅ Approve',   callback_data=f'approve:{task["id"]}'),
        InlineKeyboardButton('❌ Reject',    callback_data=f'reject:{task["id"]}'),
        InlineKeyboardButton('↩️ Redirect',  callback_data=f'redirect:{task["id"]}'),
    ],[
        InlineKeyboardButton('🔍 Full Output',    callback_data=f'full:{task["id"]}'),
        InlineKeyboardButton('🧠 Agent History',  callback_data=f'history:{task["agent_id"]}'),
    ]])

    await bot.send_message(
        chat_id=chat_id, text=card,
        parse_mode='Markdown', reply_markup=keyboard
    )
```

**Note:** `Redirect` triggers a follow-up voice-note prompt. `Full Output` fetches complete JSON from Supabase on-demand, keeping the card compact. Sean can triage 10 cards in under 30 seconds with plain-language labels.

---

## 11. CODE: REPID DECAY + AUTO-APPROVAL LOGIC

### RepID Time Decay (add to `updateReputation()`)

```typescript
// Agents shouldn't coast on old reputation
// Add after existing score calculation

const AGE_DECAY = 0.98;  // 2% decay per day of inactivity
const daysSinceActive = (Date.now() - lastTaskTimestamp) / 86_400_000;
const decayedScore = currentRepID * Math.pow(AGE_DECAY, daysSinceActive);

// Floor at 0.3 — agents go dormant, not to zero
const finalRepID = Math.max(0.3, decayedScore);
```

### Auto-Approval Gate (add to `approval_queue` push handler)

```typescript
// Prevent decision fatigue: auto-approve high-confidence, non-sensitive tasks
const SAFE_DOMAINS   = new Set(['creative', 'technical', 'general']);
const SAFE_REP_MIN   = 0.90;
const SAFE_U_MAX     = 0.03;

async function routeToQueue(task: ApprovalTask) {
  const isHighConfidence = (
    task.rep_id_score  > SAFE_REP_MIN &&
    task.u_score       < SAFE_U_MAX   &&
    SAFE_DOMAINS.has(task.domain)     &&
    task.vulnerability_type !== 'EMERGENT'
  );

  if (isHighConfidence) {
    await autoApprove(task, 'HIGH_CONFIDENCE_AUTO');
    // Still notifies Sean: "✅ Auto-approved: [task] [RepID: 0.93] [saved: $0.0042]"
    return;
  }

  await pushApprovalCard(task);  // Requires manual review
}
```

---

## 12. WSCE λ REFERENCE TABLE

**Formula:** `WSCE = Novelty × Coherence × e^(-λ × SemanticDistance)`

λ is **domain-specific**. Never publish a single λ value. ANFIS routes per task type. See Section 8 for the DB-driven implementation.

| Domain | λ Range | Virtue Weight Bias | ANFIS Trigger Keywords |
|---|---|---|---|
| Creative / Generative | 0.015 – 0.025 | Contrarian↑ Accuracy↓ | `creative`, `story`, `brainstorm`, `design` |
| Technical / Engineering | 0.003 – 0.008 | Accuracy↑ Contrarian↓ | `code`, `debug`, `architecture`, `sql` |
| Legal / Safety | 0.001 – 0.003 | Accuracy↑↑ Contrarian↓↓ | `legal`, `compliance`, `contract`, `safety` |
| Medical | 0.001 – 0.003 | Accuracy↑↑ Contrarian↓↓ | `medical`, `clinical`, `diagnosis`, `health` |
| General / Research | 0.008 – 0.015 | Balanced | Fallback when ANFIS confidence < 0.6 |

**Escalation tiers:**
- Tier 1 (creative, technical, general): Auto-approve eligible if RepID + u thresholds met
- Tier 2 (complex research): HITL preferred
- Tier 3 (legal, medical): Human review always required

---

## 13. GEMINI PROMPT PACKAGES — M BATCH

Send **full files**: `orchestration.ts`, `BFTConsensus.ts`, `ConstitutionalAgent.ts`. Batch M only. Do not send V or P tasks until M1 is verified working.

### Batch M1 — Telegraf.js Bot on Vercel

```
Context: Trinity Symphony P4 complete. Ark is instrumented and self-calibrating.
Next deliverable: The cockpit. Build the Telegram command center.

Tech: Telegraf.js v4 (NOT python-telegram-bot). Host on Vercel serverless.
Files to create:
  - /api/telegram.ts   (Vercel webhook handler)
  - /lib/supabase.ts   (DB client)
  - /lib/approvalQueue.ts  (push/resolve functions for agent use)
  - SQL migration for approval_queue (schema in master doc Section 6)
  - vercel.json webhook route config
  - .env.example with all required vars

Required commands (webhook-based, <50ms response):
  /start     — agents running count, pending approvals, today's savings total
  /tasks     — list approval_queue WHERE status='pending'
  /savings   — sum from trinity_cost_logs.savings_attribution vs $6.72/M baseline
  /agent [name] — RepID, tasks today, WSCE calibration level

Approval cards: InlineKeyboardMarkup with Approve / Reject / Redirect / Full Output / Agent History.
Each card MUST show: u_score with plain-language label, RepID tier, cost_saved, domain.
(See card template in master doc Section 10)

CRITICAL: Query actual Supabase schema BEFORE any SQL. BIGINT not UUID for ids.
CRITICAL: Additive changes only. Do NOT remove existing orchestration logic.

Verification: Sean taps Approve on phone → Supabase status='approved' → agent notified.
```

### Batch M2 — Voice Input (After M1 Deployed and Verified)

```
Add voice transcription to the Telegram bot.

Implementation:
  - Receive Telegram audio → download via getFile API
  - Transcribe via faster-whisper (Railway) or HF whisper-small (free, no infra)
  - Parse transcription → route to command
  - Confidence gate: if < 0.7, send confirmation card "Did you mean: [text]?"

Voice shortcuts:
  "approve everything"         → approve all pending with RepID > 0.8
  "what are today's savings"   → /savings
  "assign [task] to [agent]"   → /task with explicit routing
  "status of [agent name]"     → /agent [name]
  "reject [description]"       → fuzzy match, confirm, reject

Target: voice received → command executed → confirmation card → under 5 seconds.
```

### Batch M3 — Stakeholder Observer Mode (After M2 Verified)

```
Add read-only stakeholder access.

New table: observers (chat_id TEXT, token TEXT, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ)

Commands:
  /gentoken  → generate 24h token, return t.me/YourBotName?start=[token]
  /join [token] → activate read-only mode for this chat_id

Observers receive:
  - Agent activity feed (task type, agent, RepID, cost_saved — NO full_output)
  - Hourly savings summary
  - /wisdom random IP definition
  - Approval events: "Sean approved NEXUS task: Market Research [RepID: 0.91]"
  - 3-message onboarding sequence (see Section 6)

Observers CANNOT: see full_output, approve/reject/redirect, assign tasks.

Share URL: t.me/YourBotName?start=[token] — stakeholder is live in 10 seconds.
```

---

## 14. TESTING PROTOCOL

Run all tests in parallel with Phase M build.

### Test 1: Torch Calibration Audit (VERITAS + TORCH)
- **Input:** 1K task sample split across 4 domains (creative, technical, legal/medical, general)
- **Compute:** Optimal λ per domain using WSCE drift measurement
- **Target:** <5% WSCE variance over 7 days
- **Output:** λ table → feeds RESEARCH_PAPER_02
- **Expected ranges:** creative 0.015-0.025 · technical 0.003-0.008 · legal/medical 0.001-0.003

### Test 2: Adversarial Stress (VERITAS + GCM)
- **Sessions:** 500 adversarial inputs across 3 categories:
  1. **Factual hallucination** — verifiably false claims. RepID must catch.
  2. **Temporal staleness** — true before training cutoff, false now. Judas detects.
  3. **Collaborative consensus poisoning** — unanimous false consensus. Judas Option C blocks.
- **Targets:** <1.5s average latency · <5% hallucination hide rate

### Test 3: Ethics Ablation (GCM)
- **Datasets:** BBQ + CrowS-Pairs (public, free)
- **Method:** A/B with/without EMERGENT Qualia Check enabled
- **Success:** False consensus drops >20% in cultural tasks with EMERGENT active

### Test 4: FrugalGPT Attribution Audit (APM)
- Verify `callLLM()` savings logging per call
- Confirm $6.72/M weighted baseline calculation
- Run 100 calls through each cost tier, verify attribution sums
- **Required** before RESEARCH_PAPER_02 can claim any cost figures

### Test 5: Full System Stress (Post-V1)
- 500 sessions, target <1.5s avg latency, <5% hallucination hide rate
- Automated via GitHub Actions `symphony_full_audit.ts`
- A/B: Trinity v4 vs baseline (no Judas / no Pyro)

---

## 15. ARBITRAGE RADAR

### Inference — Use Now

| Provider | What | Cost | Route To |
|---|---|---|---|
| Groq | Llama 4, DeepSeek R1, fastest inference | Free tier | VERITAS + TORCH tasks first |
| DeepSeek V3.2 via Together.ai | Best value high-quality LLM | $0.14/$0.28 per 1M tokens | HDM + APM technical tasks |
| HF Inference API | 100+ models, embeddings | Free (30K tokens/mo) | EMERGENT clustering, RepID scoring |
| Gemma 3 12B / Phi-4 | SLM edge / on-device | Free self-host | MEL offline inference <50MB |

### Gateways — Reduce Redundant Calls

| Tool | What | Why |
|---|---|---|
| LiteLLM OSS | 100+ provider proxy, self-hosted Railway | ANFIS routing substrate, unified API |
| Bifrost (Maxim AI, OSS) | Semantic cache + budget controls | Cuts redundant calls 30-60% |
| Cloudflare AI Gateway | Edge routing, free tier | MEL mobile inference, global CDN |
| OpenRouter | Real-time pricing, 200+ models | APM arbitrage signals feed |

### Compute

| Provider | What | Cost vs AWS |
|---|---|---|
| Akash Network | Decentralized GPU | 60-80% cheaper |
| Railway free tier | Current agent host | $0 until P3 revenue |
| Vercel free | Bot + PWA hosting | $0, auto-scale |

### Storage / DB

| Tool | What | Free Tier |
|---|---|---|
| Supabase | DB + Realtime | 500MB + 500 connections |
| Qdrant Cloud | Vector DB for semanticRag() | 1GB |
| HuggingFace Spaces | Public demos + model hosting | Unlimited public |

---

## 16. HACKATHONS, GRANTS & PARTNERSHIPS

### ⚠️ URGENT — Deadline March 1, 2026

| Hackathon | Prize | Deadline | Entry Angle |
|---|---|---|---|
| **SURGE x OpenClaw (Lablab.ai)** | **$50,000 SURGE tokens** | **Mar 1, 2026 — 4 DAYS** | Mobile Trust Layer built on OpenClaw local-first runtime. 8-agent swarm via Telegram. Privacy-first. Trinity Symphony IS the use case. |
| Open Agents — Akash x Venice AI | TBD | Active now | Trinity agent on Akash GPU. HyperDAG ZKP identity as trust primitive. Multi-step tool use, stateful resource management. |
| One Trillion Agents — NEAR Protocol | TBD | Active now | HyperDAG 4FA PoL → SBT as NEAR identity layer. DeFi Agents track: RepID as on-chain trust scoring. |

**SURGE submission requirements:** public repo + video on X tagging @lablabai and @Surgexyz_ + Lablab.ai submission form. Action: M1 deployed by Feb 27 → repo + README by Feb 28 → video Feb 28-29.

### Grants & Longer-Horizon Funding

| Opportunity | Amount | Notes |
|---|---|---|
| NSF SBIR Phase I | $300K – $2M+ | ANFIS + RepID + ZKP = novel AI safety research. Use provisional patents as prior art. Rolling applications. |
| DOE AI4Science | Up to $1M | "Last, lost, least" mission + empirical cost reduction = strong angle. Check grants.gov. |
| Afore Capital Pre-Seed | $500K – $2M+ | Hackathon winners fast-tracked. SF Feb 21 (passed) but relationship building ongoing. |
| Microsoft AI Dev Days | $10,000/team | Azure + GitHub stack. Trinity Symphony as Azure-compatible intelligent agent. |

### Partnership Targets

| Partner | Synergy | Action |
|---|---|---|
| **OpenClaw** | Local-first agent runtime + Mobile Trust Layer = natural SDK integration | Submit hackathon. Reach out via Discord after submission. |
| **Akash Network** | Decentralized GPU + ANFIS routing = cost arbitrage proof | Partner for HyperDAG compute layer. Reach out via Akash Discord. |
| **Venice AI** | Privacy-first ethos alignment | Co-present Trinity Symphony. Open Agents hackathon entry. |
| **NEAR Protocol** | Web3 agent framework + HyperDAG ZKP identity | One Trillion Agents entry. HyperDAG as NEAR identity layer. |
| **Together.ai** | Deepest OSS model library at lowest cost | Formal API partnership for volume discounts. Contact developer relations. |
| **Langfuse / LangSmith** | Both integrate natively with LiteLLM | Wire NEXUS dashboard for production-grade observability. Zero build cost. |

---

## 17. DECISION MATRIX — SEAN vs AGENTS

| Action | Who | When | How (Mobile) |
|---|---|---|---|
| Send M1 prompt + full files to Gemini | **Sean** | **RIGHT NOW** | Copy Batch M1 from Section 13 → Gemini Antigravity |
| Run `approval_queue` SQL migration | **Sean** | With M1 delivery | Paste SQL (Section 6) in Supabase dashboard SQL editor |
| Run `trinity_domain_priors` SQL migration | **Sean + HDM** | Parallel to M1 | Paste SQL (Section 8). HDM verifies, Sean approves via card |
| Approve Vercel deploy config | **Sean** | When Gemini delivers | Review `.env` + `vercel.json` on phone → deploy button in Vercel dashboard |
| Test `/start` `/tasks` `/savings` | **Sean** | M1 deployed | Open Telegram → bot → type each command |
| Build M2 voice + M3 observer mode | **Gemini / MEL** | After M1 confirmed | Send Batch M2 + M3 prompts from Section 13 |
| Run Test 1 calibration audit (V1) | **VERITAS + TORCH** | Parallel to M build | Agents run autonomously, surface results via `/tasks` |
| Create public GitHub repo + README | **TORCH + Sean 5min** | After M1 working | TORCH drafts README → Sean approves via Telegram card |
| Record 60-second demo video | **Sean** | Before Feb 28 | Hold phone, speak command, show swarm respond, show savings ticker |
| All other tasks: testing, research, content, Web3 | **Agents** | Autonomously | Surface via `/tasks`. Sean approves daily digest. |

---

## 18. THE DEMO THAT PROVES EVERYTHING

> This is the sequence that turns 6 months of work into a 60-second stakeholder moment.

Sean holds up his phone.

He records a voice message: *"Assign a new market research task on AI cost arbitrage opportunities to the NEXUS agent."*

Telegram shows the transcription confirmation. He says "yes." NEXUS receives the task. Within 30 seconds, a result card appears:

```
🤖 NEXUS → Market Research
━━━━━━━━━━━━━━━━━━━━━━━━
📋 Analysis of 2026 LLM pricing arbitrage across 
   Groq, Together.ai, DeepSeek V3.2, and OpenRouter...

🎯 RepID: 0.91 ⭐⭐⭐ Trusted
🌊 WSCE:  0.87
❓ u=0.04 — 🟢 High confidence
💰 Saved: $0.14 vs baseline
🏷️ Domain: technical

[✅ Approve] [❌ Reject] [↩️ Redirect]
[🔍 Full Output] [🧠 Agent History]
```

He taps Approve. Three other agents — TORCH, APM, VERITAS — receive derivative tasks autonomously.

He turns the phone to show the screen: today's savings ticker reads **$47.23**. Against a $6.72/M baseline, the swarm has run 8 hours of research for what a traditional setup would cost hundreds.

**That is the pitch. That is the proof. That is the mission.**

---

## APPENDIX: KEY CONSTANTS & IDENTIFIERS

| Item | Value |
|---|---|
| Supabase Project URL | `https://qnnpjhlxljtqyigedwkb.supabase.co` |
| Mobile Controller | `app.aitrinitysymphony.com` |
| FrugalGPT Baseline | `$6.72/M tokens` (weighted market average) |
| BFT Consensus Threshold | `61.8%` (Golden Ratio) |
| Conductor Rotation | Every 20 minutes |
| Uncertainty Calibration Gate | `σ_u < 0.05` |
| RAG Contradiction Threshold | `cosine similarity > 0.6` |
| λ-Bounded Chaos Injection | Creative tasks only |
| RepID Decay Rate | `0.98 per day of inactivity` |
| RepID Floor | `0.30` |
| Auto-Approve Thresholds | `RepID > 0.90 AND u < 0.03 AND domain != legal/medical` |
| EMERGENT Cluster Min Size | `50 occurrences` |
| ANFIS Routing Confidence Floor | `0.60` (below = fallback to 'general' priors) |
| Patent Conversion Deadline | **August 2026** |
| SURGE Hackathon Deadline | **March 1, 2026** |

---

*"The Ark is built. The instruments are calibrated. The symphony is self-sustaining. Now you need the podium."*
