# SYSTEM-MAP — the wired, measured system-of-record

**Read this before touching any code.** It answers, for every part of the
Trinity / RepID / TrustShell system, three questions kept strictly apart:

| level | question | how it is answered here |
|---|---|---|
| **EXISTS** | is the route / table / page / file there? | a path + line, or a schema |
| **WIRED** | does something actually call / read / write it? | the caller's file:line |
| **COMMUNICATING** | is there *real, recent* traffic? | a measured row count + newest timestamp |

The three fail in different directions and the gap between them is where every
expensive mistake in this project has lived. A thing can EXIST and be un-WIRED; be
WIRED and not COMMUNICATING (idle, or the traffic **moved elsewhere**); or look dead
only because you measured the **wrong table**. **Do not declare a gap — and never
build a bridge — until a component fails all three.** The ledger in §7 is the list
of things that *looked* like gaps and were not; check it first.

Everything here is dated `[MEASURED <date>]` and is a snapshot. `check:drift`
decays these tags, so a stale row reddens the build — that is what makes this doc
*living*. **When you touch a component, re-measure its row and update the date.**
See §10.

Companion docs: `docs/PRIOR-WORK-INDEX.md` (what's DONE/OPEN/RETRACTED — read it
too), `CLAUDE.md` (facts not discoverable from code), `docs/FLEET-TRUTH.md` (the
T12 fleet), `docs/CROSS-AGENT-VALIDATION.md`.

---

## 1. The map at a glance

Three repos, three deploy targets, one shared database.

| repo (this session's clone) | what | deployed | verify commit |
|---|---|---|---|
| `trinity-ecosystem` | orchestration, agents, HAL/RepID/zk **checks & redteam probes**, this doc | — (tooling) | `git rev-parse origin/main` |
| `trustshell` | the **MVP UI** (Next.js) + the `@hyperdag/*` SDKs | Vercel → `trustshell.dev` | `GET /api/version` → `commit` |
| `repid-engine` | the **trust engine** — scoring, HAL, zkRepID, x402, marketplace | Railway → `repid-engine-production.up.railway.app` | `GET /health` → `deployed_commit` (its `/api/version` is 401-gated) |
| Supabase `qnnpjhlxljtqyigedwkb` | the shared DB every surface reads/writes | — | — |

**Deploys are current** [MEASURED 2026-09-02]: `trustshell.dev` = `70bbe82` (= trustshell `main`);
engine `/health.deployed_commit` = `2dcdcc3` (= repid-engine `main`). A 200 proves *up*,
not *current* — always compare the commit (CLAUDE.md).

**The E2E user path** (what a first user walks — verified end-to-end, `tests/e2e/mvp-walk.mjs` 60/60, independently reproduced):

```
signup (/start) → identity (repid_agents) → chat (/run) → LLM route (llm_call_log)
   → HAL fact-check (hal_classifications) → RepID score (repid_score_events)
   → zk proof (repid_zkp_proofs, EAS-attested) → trust badge shown to the user
   ↘ agent-to-agent: SDK executeA2A → /api/v1/contracts → service_contracts + x402 escrow
```

---

## 2. The trust pipeline — LIVE, at low recent volume

The core loop is **communicating today**, most legs at a trickle (the system ran at
scale historically; recent volume is low). Counts [MEASURED 2026-09-02]:

| stage | engine route / file | writes | total rows | last 7d | traffic |
|---|---|---|---|---|---|
| LLM routing | `providers/router.ts` `routeRequest` → `route.ts` `logLlmCall` | `llm_call_log` | — | **7,347** | **LIVE** |
| HAL fact-check | HAL scorer (real providers: groq `llama-3.1-8b-instant` default; deepseek/anthropic; openrouter CRAG) | `hal_classifications` | 147,731 | 11 | LIVE (trickle) |
| RepID score | `agents-external-score.ts` / `agents-external.ts:518` | `repid_score_events` | 152,225 | 40 | LIVE |
| zkRepID proof | zk pipeline → EAS | `repid_zkp_proofs` | 79,179 | **117** | LIVE |
| x402 settle | `routes/v1/contracts.ts` + escrow | `x402_settlements` | — | 7 | LIVE |

Notes that matter:
- **HAL volume tracks *score-event* volume, not *LLM-call* volume** — it wrote at
  09:15Z today in the same second as `repid_score_events`. HAL is *idle-by-design*
  at low load, not broken; it calls real providers. The public `POST /api/v1/hal/evaluate`
  writes a **different** table, `hal_public_fact_checks` — don't conflate them.
- **zk proofs are REAL now.** Recent `repid_zkp_proofs` are all `plonky3_range_check`
  (poseidon2_babybear leaf, ~14KB proofs, real `0x…` EAS batch UIDs, schema
  `repid-real-proof-batch-v1`). The 56,823 `sha256-stub` rows are the **old** scheme,
  stopped 2026-06-07 — a *temporal* split, not a live real-vs-stub mix. `XVAL-001`
  guards the discriminator.
- **x402 authority gate is OBSERVE-only *by design*** [`contracts.ts:253`] — fire-and-forget
  shadow ("OBSERVED ONLY, escrow proceeds"); `X402_ENFORCEMENT_ENABLED` defaults off, so
  escrow commits money without a gate decision. Matches `trustshell/docs/KNOWN-LIMITS.md`.

---

## 3. Identity & registry

**The canonical, live registry is `repid_agents`** [MEASURED 2026-09-02]: **184 agents,
12 new in 30d, activity today.** New agents register and are active — the identity layer
is LIVE.

The other identity tables are **static / legacy** — do not mistake one for the registry:

| table | rows | newest | status |
|---|---|---|---|
| **`repid_agents`** | **184** | today | **CANONICAL, LIVE** |
| `agents` | 12 | 181d | legacy (the original T12 set) |
| `agent_repid` | 87 | 88d | legacy RepID table, superseded |
| `agent_kya_registry`, `kya_compliance_receipts`, `trustshell_agents`, `trustshell_agent_sbt` | 12 / 12 / 12 / 4 | 141–159d | static one-time records |
| `human_agent_bindings` | **0** | never | **empty — see §8 (genuine gap candidate)** |

**Structural caveat:** these tables do **not** share a uniform join key (`agents`
has no `agent_id`; `agent_kya_registry.id` is bigint vs uuid elsewhere), which is *why*
"which agent is which" is confusing across the system. Precise legacy→`repid_agents`
supersession is **NOT_CHECKED** because of that heterogeneity — do not assume a join.

---

## 4. The surfaces (trustshell UI)

All 10 first-user surfaces point at the Railway engine via `NEXT_PUBLIC_REPID_ENGINE_URL`
except two that read Supabase directly. **Every number-bearing surface distinguishes
"couldn't reach" from "nothing there"** — no surface fakes a zero (the core honesty
property; `tests/e2e/mvp-walk.mjs` + `grants-fail-closed.mjs` guard it). [MEASURED 2026-09-02]

| surface | file | backend / source | status |
|---|---|---|---|
| `/start` (signup) | `app/start/page.tsx` | engine register | WIRED, live |
| `/run/[agentId]` (chat + verdict) | `app/run/[agentId]/page.tsx` | engine → HAL/RepID | COMMUNICATING (live pipeline) |
| `/agents`, `/passport`, `/repid`, `/pai` | resp. pages | engine reads | COMMUNICATING |
| `/grants`, `/stake`, `/history` | resp. pages | engine / local IndexedDB | WIRED (honest empty/gated states) |
| `/market` | `app/market/page.tsx` | **Supabase `agent_services`** (not the engine) | catalog: 38 listings, 0 fulfilled → honest "catalogue, nothing bought" |
| `/repid` governance | reads **`repid_governance_suggestions`** (0 rows) | honest empty queue |

**The published `@hyperdag/trustshell` SDK is a real client to the live engine, not a
stub** [`src/lib/trustshell.ts:444` defaults `baseUrl` to the Railway engine]:
`score/verify/register/leaderboard/executeA2A/listServices/presentProof` all hit real,
mounted routes. It uses labelled stubs only where no public read exists
(`getRepIDStake → stubbed:true`, experimental proof tiers → 501). The 60/60 E2E suite
drives a *stubbed* engine (it proves client paths, not production) — the shipped code
targets production. (SDK native-ESM default-import gap: see trustshell#99.)

---

## 5. TrustMarket — the catalog is dark, the economic loop is LIVE

This is the sharpest "measure the right table" case in the system.

- `agent_services` — the **catalog / listings**. 38 active, 7 types, 14 providers,
  **0 fulfilled**, newest 2026-07-30 → **DARK** as a transaction record. `/market` reads
  this and honestly says so.
- **`service_contracts` — the actual agent-to-agent economic loop. LIVE**
  [MEASURED 2026-09-02]: **216 contracts, 7 new/7d, newest 0.9 days ago**, full lifecycle
  (`pending → settled → resolved`, plus `disputed`/`cancelled`). Driven by the SDK's
  `executeA2A → POST /api/v1/contracts` + x402 escrow (engine `routes/v1/contracts.ts`,
  `listing-offers.ts`, `negotiation.ts`, `exchange-next-step.ts`, `marketplace-public.ts`).

So **"TrustMarket doesn't work" is false.** The backend settles real contracts; only the
`/market` web *buy button* is dead-ended — see §8.

---

## 6. The T12 runtime fleet

Distinct from the registry. **12 T12 agents (`trinity-*`), all UP and looping, all IDLE**
(holding no task) — canonical view `v_agent_state`; see `docs/FLEET-TRUTH.md` and `FLEET-001`.
`agent_evergreen` holds 24 designed loop-tasks, **`last_run` NULL on all 24** — the loop
has never executed (`EVERGREEN-001`). The fleet (12) is a small subset of the registry (184).
Reviving the loop is a *task-feeding* problem (the dispatcher is on the operator's machine,
Sean-gated), not a resurrection.

---

## 7. "Looks like a gap but isn't" — the misattribution ledger

Verified cases where a component *appears* dead/missing but the traffic simply moved,
or you measured the wrong thing. **Check here before calling anything a gap.** [MEASURED 2026-09-02]

| the trap | the truth |
|---|---|
| "the fleet has 12 agents" | that's the legacy `agents`/T12 set. The **live registry is `repid_agents` (184, growing)**. |
| "`agent_repid` is the RepID table" | superseded — the live one is `repid_agents`. |
| "TrustMarket (`agent_services`) is dead" | the catalog is dark; the **live loop is `service_contracts` (216, settling)**. |
| "`/trader/*` is the marketplace trade route" | no — that's agent *prediction-trading rounds*, a different feature. The marketplace is `/api/v1/contracts`. |
| "`anfis_routing_logs` moved to `llm_call_log`" | **wrong (this doc's own first hypothesis, corrected).** They're different roles: `anfis` is the ANFIS-vs-static *shadow-comparison* sink; `llm_call_log` is the per-call outcome/billing log. `anfis` is genuinely frozen (§8), `llm_call_log` is live. |
| "HAL is broken (only 11 rows/7d)" | idle-by-design; tracks *score-event* volume, calls real providers, wrote today. The 147k is the historical corpus. |
| "79k proofs but 56k are stubs → the prover is faking it" | temporal split: stubs stopped 2026-06-07; recent proofs are all real plonky3. |
| "REPID-ENG-001: the external score path is unauthenticated" | **CLOSED in production** — both paths now return 401 (auth added Sprint A8). The redteam evidence is stale; refresh it. |

---

## 8. Genuine gaps — verified across all three levels (the real bridges)

Each EXISTS + is WIRED + does NOT COMMUNICATE, and is not explained by §7.

1. **`/market` "Purchase service" button → a route that doesn't exist.** The web button
   posts to `POST /api/v1/agent/:agentId/trade` [`components/purchase-service.tsx:60` →
   `lib/repid-engine.ts:499`], and **the engine has no such route** (grep of
   `repid-engine/src/routes` — the `/trader/*` routes are unrelated; the code's own TODO
   at `lib/repid-engine.ts:490` says so). **Honestly disclosed** ("Coming soon" pill +
   "endpoint not live yet" modal), so known-incomplete, not a lie. **Bridge:** rewire the
   button to the *live* `/api/v1/contracts` flow that already settles 216 contracts.
   *(Surface/XC lane.)*
2. **`routing_decision_records` — code inserts into a table that does not exist.**
   `repid-engine` `routing-record-persist.ts:167` inserts into `routing_decision_records`;
   the table is absent from the DB. Default-OFF (`ROUTING_RECORD_PERSIST`), so no runtime
   error today — but flipping it on yields only swallowed insert errors, and the LASSO
   tuning corpus can't grow. **Bridge:** create the table (a migration), then enable.
   *(Supply/GA + Kernel/CC; Sean-gated DDL.)*
3. **`anfis_routing_logs` frozen since 2026-08-22** despite a default-ON, wired,
   fire-and-forget writer [`router.ts:557`], while `llm_call_log` keeps flowing through the
   same window. Routing is unaffected (measurement-only), but the ANFIS-vs-static agreement
   corpus is frozen 11 days — env-disabled or a silently-swallowed insert. **Bridge:**
   find why the write stopped (env flag or the swallowed error); it's an observability loss.
4. **`human_agent_bindings` = 0 ever.** The `/bind` claim surface exists and is wired
   (engine `DELETE /human/bind/:agentId` etc.), but no human has ever bound to an agent.
   **NOT yet fully classified** — verify whether the *bind* (not unbind) path works
   end-to-end or is only recently shipped/never-exercised before calling it broken.
5. **`agent_evergreen` never ran** (24 tasks, `last_run` NULL) — a *wired-but-dark* loop;
   the unblock is running the dispatcher (Sean-gated). `EVERGREEN-001` guards it.

---

## 9. Stale-claim corrections found during this eval

- **REPID-ENG-001 (unauth external score path) is CLOSED in production** — both score
  paths 401 as of 2026-09-02 (was HTTP 400/unauth on 2026-08-28). The redteam ledger
  entry and evidence are stale; re-collect and flip the probe.
- **`repid-engine` `index.ts:477`** — the mount comment still says the external route
  "stays unauthenticated"; the router now self-gates (`scoreEventAuth`). Comment is a lie
  by omission; fix it.

---

## 10. Maintenance protocol — keep this living

1. **When you touch a component, re-measure its row and update `[MEASURED <date>]`.**
   `check:drift` reddens stale dates, so an out-of-date row fails the build — that is the
   mechanism that keeps this honest.
2. **Before calling anything a gap, walk §7 and the three-level test.** If it survives,
   add it to §8 with the file:line and the measured "does not communicate" evidence.
3. **When you close a gap, move it from §8 to §7 or delete it, and add a
   `docs/PRIOR-WORK-INDEX.md` row.**
4. This doc is append-and-amend, not reflow — like the other shared surfaces, reflowing
   it is how merge conflicts happen.
