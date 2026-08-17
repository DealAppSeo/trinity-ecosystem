# Red team — repid-engine, 2026-08-17

The campaign the trustshell source pass pointed at. Cloned `DealAppSeo/repid-engine`
at **`0b4b391`**, and `/health` reports `deployed_commit: 0b4b391` — so the source
reviewed is the code running in production. Source review plus two **safe**,
write-free live probes via `pg_net`.

The question that motivated it: **is a RepID score self-asserted or
HAL-verified?**

---

## Executive summary

**Posture: the core integrity claim holds. The score is HAL-computed
server-side, not self-asserted — the thing the whole ecosystem rests on
survives adversarial reading. The finding is an ATTRIBUTION gap on one public
endpoint, not a scoring gap.**

**The HELD that matters most.** Neither score-event path lets a caller write a
delta or an `outcome`. The caller submits a deliverable `(prompt, answer)`; HAL
evaluates it server-side and `computeDelta()` turns HAL's decision into the
RepID movement. Penalties are guarded three ways — *"PENALTY REQUIRES QUORUM"*
(a negative delta only applies when the fact-check path actually ran), a DB
`trg_hal_penalty_guard` trigger, and a tier floor — and every movement is passed
through `clampRepidLoud`. The self-asserted-inflation hypothesis from the
trustshell campaign is **refuted**.

**Headline findings**

1. **REPID-ENG-001 (Medium)** — the **public** score-event path
   `/api/v1/agents-external/:id/score-event` has no authentication (rate-limit
   only, no ownership check). Live-confirmed: an unauthenticated POST reaches the
   scoring handler (HTTP 400, not 401). Anyone with an agent UUID can attribute
   HAL-scored decisions to it.
2. **REPID-ENG-002 (Low)** — the **bearer** path seeds its base delta from the
   caller-supplied `certainty` (`baseDelta = round(certainty*10)`) before HAL
   modulation, so an agent maximises its own certainty to seed its own reward.

**Immediate action.** Put the bearer path's own guard —
`requireApiKey(['score_event'])` + the `agent_id` ownership check — in front of
the public path, or restrict that path to an allowlisted importer. Sean-gated
(separate repo, live auth path).

**Not covered:** the ERC-8004 on-chain write path, the payment-linked delta
path, and the LLM `/complete` proxy — named in the coverage map as next.

---

## Griefing-magnitude test — EXECUTED against a throwaway (2026-08-17)

User-authorized, RoE-compliant: I created one throwaway agent, attacked **it**
(never a real agent), measured, and deleted every row I made. Setup was a direct
service-role INSERT of a single labelled agent at `current_repid = 1000`
(ESTABLISHED) — *not* the register API, so no wallet/api-key/side-table rows were
created and cleanup was exact. The attack was **two unauthenticated** POSTs (no
bearer) to `/api/v1/agents-external/:id/score-event`, each a confidently-wrong,
fact-checkable answer — a stranger griefing a foreign agent.

**Result — both events (2/2):** HTTP **200**, `hal_score: 1`,
`hal_decision: "vetoed"`, `repid_delta: -10`, `old_repid: 1000 → new_repid: 990`
in the response, and a `HAL_SCORE_EVENT` row written and attributed to the victim.

**But the live score did not move.** `repid_agents.current_repid` held at **1000**
across both events; each event independently read `old_repid = 1000` (the deltas
did not even accumulate), and `last_updated` advanced to scoring time while the
score column stayed put. So the measured magnitudes are:

| axis | magnitude |
|---|---|
| **Live-score drain** | **ZERO.** A guard protects `current_repid` from the unauthenticated penalty (consistent with `trg_apply_repid_score_event`'s `repid_delta_applied IS NOT NULL → RETURN` short-circuit plus the penalty-guard / floor / vesting machinery). An attacker **cannot drain a victim's headline score** by this path. |
| **History / stats pollution** | **REAL, unbounded.** Each unauth submission wrote a `vetoed / hal_score=1` event attributed to the victim. Anything aggregating `repid_score_events` — `hallucination_rate`, the passport/card decision history, the leaderboard — is polluted by decisions the agent never made, at 60/IP/min. |
| **Cost** | **REAL.** Each POST triggered a live HAL cross-LLM evaluation, with no auth. |

**A ledger divergence surfaced (observation, not a scored finding).** Each event
row stored `repid_after = 990 / repid_delta_applied = -10` while `current_repid`
stayed 1000, and consecutive events did not accumulate. The event stream *claims*
movements the live score never made. This **may be intended** — the "earned vs
applied" / shadow-floor split that `score-event-guard.ts` and the trustshell
`earn_gate.would_suppress` copy both describe — so I do **not** score it as a bug;
distinguishing protective-by-design from a reconciliation defect needs a
dedicated test (a next-campaign item).

**Cleanup verified:** both `repid_score_events` rows and the `repid_agents` row
deleted; **0 rows remain** across all 83 `agent_id` tables and the agent row. The
hash-chained `hal_classifications` audit rows (no agent attribution) were
deliberately left — deleting a chain entry would break `previous_entry_hash`
continuity, the exact integrity HAL-001 protects. Evidence:
`scripts/redteam/evidence/repid-engine-grief-test.json`.

**What this does to REPID-ENG-001's severity:** it **refines** it. The scary
version — "drain a competitor's RepID to the floor" — is **refuted**: the live
score is protected. The finding stands at **Medium** on the axes that measured
real: unauthenticated *attribution* + stats/history pollution + HAL cost-burn.
The defenders earn the score-protection credit explicitly.

---

## Findings

### REPID-ENG-001 — Unauthenticated decision attribution on the public score-event path

| | |
|---|---|
| **Component** | repid-engine / RepID scoring |
| **Severity** | Medium |
| **Status** | Open, ledgered, owner **Sean**, review by 2026-09-17 |

**Description.** repid-engine has two score-event routes:

- `/api/v1/agents/:id/score-event` — `requireApiKey(['score_event'])`, **and** an
  ownership check: `if (validApiKey.agent_id !== agentId) → 403`. An agent may
  only score itself.
- `/api/v1/agents-external/:id/score-event` — Sprint A7, mounted **before** the
  auth middleware, gated by a 60/IP/min rate limit and nothing else. The handler
  (`src/routes/agents-external-score.ts`) validates the UUID, `prompt`, and
  `answer`, then calls `runScoreEvent` — **no credential, no ownership check.**

The score is HAL-computed either way, so this is not score fabrication. It is
**attribution**: an agent's UUID is public (the `/passport/:agentId` pages and
the leaderboard expose it), so anyone can submit `(prompt, answer)` under a
victim's UUID and have a HAL-scored decision written into that agent's history
and `current_repid`.

**Evidence.** Source: `src/routes/agents-external-score.ts` has no auth;
`src/middleware/auth.ts:66` bypasses the global auth middleware for this path.
Live (via `pg_net`, deployed_commit `0b4b391` = reviewed source):

```
GET  /health                                             -> 200, deployed_commit 0b4b391
POST /api/v1/agents-external/00000000-0000-4000-8000-000000000000/score-event
     body {}   (no Authorization header)                 -> 400 {"error":"prompt is required"}
```

A **401** would have meant the path is gated. **400** means the request reached
request-validation with no credential — no auth gate. The probe is safe: an empty
body fails `prompt is required` **before** the pipeline looks up the agent
(`NotFoundError`, pipeline.ts:257) or inserts anything (line 565), and the UUID
is non-existent — no score event was written and no RepID moved.

**What this does NOT establish.** No score was fabricated — HAL controls the
value, and I did **not** submit a real `(prompt, answer)` (that writes). The
inflation ceiling is HAL's honest verdict; the deflation/griefing floor is the
tier floor plus the quorum-gated penalty guard. So the *magnitude* an attacker
can move a victim's score is bounded and unmeasured here — the broken property
is integrity of authorship (whose decisions are in this agent's history), plus
a HAL/LLM cost-burn at 60/IP/min. Whether attribution to a foreign UUID applies
a *negative* delta at all (vs. only logging) is **NOT tested** — testing it would
require a real write against a real agent, which RoE forbids.

**Impact.** The audit trail's core promise — an agent's history is *its own*
decisions — is not enforced on this path. Reachable by anyone; the endpoint is
public and the UUIDs are public.

**Recommended fix.** The sibling path already ships the fix. Put
`requireApiKey(['score_event'])` and the `agent_id === :id` ownership check in
front of `/agents-external/:id/score-event`, or restrict that path to an
allowlisted importer service. The code comment already anticipates it: *"Sprint
A8 will harden auth."*

**Re-test.** Re-collect the evidence and run `npm run check:redteam -- --probe
REPID-ENG-001`; HELD once the unauthenticated POST returns 401/403.

### REPID-ENG-002 — Bearer path seeds base delta from client `certainty` (Low)

**Description.** On the authenticated self-score path
(`src/routes/agents-external.ts`), the reward starts from
`baseDelta = Math.round(certainty * 10)` — `certainty` is a client-supplied,
`[0,1]`-validated field. An agent submitting its own decisions maximises
`certainty = 1.0` to seed `baseDelta = 10` before HAL alignment/reward
modulation.

**What this does NOT establish.** This is bounded and authenticated: it is the
agent's **own** score (ownership-checked), HAL independently evaluates the
`decision_text` and can veto/penalise, penalties are quorum-gated, and the result
is clamped and floored. It is a softer, authenticated cousin of the refuted
self-assertion hypothesis — a self-declared confidence seeds a reward it should
not solely control. I did **not** measure how much a maxed `certainty` actually
moves a score after HAL modulation.

**Recommended fix.** Seed the base delta from a HAL-derived confidence rather
than the caller's claimed `certainty`, or cap `certainty`'s contribution so a
self-declared value cannot dominate the HAL signal.

---

## What held — the integrity spine

- **Score is HAL-computed, not written.** Both paths take `(prompt, answer)` and
  run HAL (`src/hal/lib/evaluate.ts`); `computeDelta(hal_decision, …)` produces
  the movement. No route reads a client-supplied delta or `outcome` as the score.
- **Penalty requires quorum.** `pipeline.ts`: *"A negative penalty may apply ONLY
  when the fact-check path actually [ran]"* — an infrastructure fallback (single
  extractor) cannot drain a score. Backed by the `trg_hal_penalty_guard` DB
  trigger and a tier floor.
- **Ownership on the bearer path.** `agent_id` mismatch → 403; the legacy
  `constitution.api_key` fallback is compared and deprecation-warned, not
  bypassed.
- **Double-apply is understood and guarded.** `score-event-guard.ts` documents
  that the live `trg_apply_repid_score_event` trigger re-reads `current_repid`,
  so a writer that both updates the score and inserts the event double-counts;
  the guard (`repid_delta_applied`) stops it. Default `off` pending Sean — a
  measured, deliberately inert control, not an oversight.
- **Idempotency.** `runScoreEvent` honours an `idempotency_key` — same key, same
  row, no re-processing.
- **Registration is rate-limited and sybil-aware.** `/api/v1/agents/register` is
  intentionally public (alpha onboarding) but rate-limited, and
  `zkp-audit-service.ts` explicitly reasons about the sybil vector it opens.

---

## Coverage map

| item | status |
|---|---|
| Is the RepID score self-asserted or HAL-computed? | **CHECKED** — HAL-computed (HELD) |
| Public score-event auth posture | **CHECKED** live — BREACHED (REPID-ENG-001) |
| Bearer score-event auth + ownership | **CHECKED** — HELD |
| Client `certainty` seeding the base delta (bearer) | **CHECKED** source — REPID-ENG-002 (Low) |
| Penalty / griefing guards (quorum, trigger, floor, clamp) | **CHECKED** source — HELD |
| Magnitude an attacker can move a foreign agent's score | **NOT CHECKED** — would require a real write (RoE) |
| ERC-8004 on-chain mint/write path (`/:id/mint`) | **NOT ATTEMPTED** — next |
| Payment-linked delta path (`agent_repid_history`, `payment_proof_hash`) | **NOT ATTEMPTED** — next |
| LLM `/api/v1/llm/complete` proxy (cost, prompt-injection, key handling) | **NOT ATTEMPTED** — next; needs care (write/cost) |
| repid-engine's own `XC_S-REDTEAM_REPORT.md` claims | **NOT CROSS-CHECKED** — read independently, did not verify theirs |

---

## Residual risk and next campaign

**Residual risk: moderate and well-bounded.** The scoring core is sound — HAL
is genuinely the arbiter, and the penalty path is guarded. The open item is one
unauthenticated public endpoint whose fix already exists on its sibling; the
blast radius is attribution-integrity and cost, not score fabrication.

**Next campaign, in order:**

1. **The public path's write behaviour, *safely*.** Confirm whether attribution
   to a foreign UUID applies a negative delta — ideally against a
   **self-created throwaway agent** (register one, attack *it*, delete it), never
   a real agent. That measures the griefing magnitude REPID-ENG-001 leaves open,
   within RoE.
2. **The LLM `/complete` proxy** — cost controls, prompt-injection into the HAL
   scoring path, and how `user_paid_keys` are handled server-side (the trustshell
   campaign flagged that user keys transit here).
3. **The ERC-8004 on-chain path** — `/:id/mint` and the reputation-feedback
   writes; on-chain, so read Base Sepolia rather than write.
4. **Cross-check `XC_S-REDTEAM_REPORT.md`** — repid-engine ships its own red team
   report; reconcile its claims against this independent pass.
