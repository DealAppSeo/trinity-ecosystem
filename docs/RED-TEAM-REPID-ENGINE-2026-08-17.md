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

**The throwaway's live score did not move — but that measured its floor, not the
path.** `repid_agents.current_repid` held at **1000** across both events; each read
`old_repid = 1000` and the deltas did not accumulate. **CORRECTED 2026-08-17:** that
throwaway sat **exactly on its earned floor** (`peak = current = 1000 =
tier_lower_bound(1000)`), so its **drainable gap was 0 by construction** — an
unrepresentative sample (flagged by PR #81's DB map, then measured against live
`repid_agents`). The clamp `trg_repid_earned_floor` only raises `current_repid`
**up** to `coalesce(floor_override, tier_lower_bound(peak_repid))`; a penalty
landing **above** that floor applies in full. So the measured magnitudes are:

| axis | magnitude |
|---|---|
| **Live-score drain** | **BOUNDED, not zero — this RETRACTS the earlier "ZERO".** An unauthenticated caller can drain a targeted agent's `current_repid` **down to its earned floor** (bounded by the drainable gap; it cannot go below the floor and cannot fabricate a high score). VERIFIED against live `repid_agents` 2026-08-17: **164/176 agents (93%) have a drainable gap** (avg **295** pts, max **2000**, 48,438 total drainable points); only **12/176 sit at floor** like the throwaway did. A session with `app.bypass_repid_floor='true'` skips the clamp entirely (confirmed early `RETURN NEW` in the trigger). The at-floor 7% are the only agents for which the drain is genuinely zero. |
| **History / stats pollution** | **REAL, unbounded.** Each unauth submission wrote a `vetoed / hal_score=1` event attributed to the victim. Anything aggregating `repid_score_events` — `hallucination_rate`, the passport/card decision history, the leaderboard — is polluted by decisions the agent never made, at 60/IP/min. |
| **Cost** | **REAL.** Each POST triggered a live HAL cross-LLM evaluation, with no auth. |

**A ledger divergence surfaced — now RESOLVED as REPID-ENG-003 (Low), below.**
Each event row stored `repid_after = 990 / repid_delta_applied = -10` while
`current_repid` stayed 1000. Investigated to root cause and verified: the DB
trigger `trg_repid_earned_floor` clamps `current_repid` up to
`tier_lower_bound(peak_repid)`, absorbing the penalty, while the event keeps the
pre-clamp value. It is **both** a partial control (the earned floor
**caps** the live-score griefing at the floor — zero drain only for agents already
sitting on it, a bounded drain for the other 93%) **and** a Low ledger-accuracy
defect (the event overstates the applied movement). Full mechanism and behavioural
proof in the finding.

**Cleanup verified:** both `repid_score_events` rows and the `repid_agents` row
deleted; **0 rows remain** across all 83 `agent_id` tables and the agent row. The
hash-chained `hal_classifications` audit rows (no agent attribution) were
deliberately left — deleting a chain entry would break `previous_entry_hash`
continuity, the exact integrity HAL-001 protects. Evidence:
`scripts/redteam/evidence/repid-engine-grief-test.json`.

**What this does to REPID-ENG-001's severity:** the first pass **over-credited**
the defenders. "Drain a competitor's RepID to the floor" is **not refuted — it is
confirmed for 93% of agents**, bounded to the earned floor rather than to zero. The
finding stands at **Medium, arguably High**: the drain is unauthenticated,
widespread (164/176 agents, up to 2000 pts) and a targeted griefing/defamation
vector; what keeps it below Critical is that it is bounded to the earned floor and
HAL must actually veto the injected decisions. The score-protection credit is
**partial**, not full — it protects the ratchet floor, not the headline score
above it.

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

### REPID-ENG-003 — Score-event ledger overstates the applied penalty (Low)

| | |
|---|---|
| **Component** | repid-engine / RepID scoring ledger |
| **Severity** | Low |
| **Status** | Open, ledgered, owner **unassigned**, review by 2026-10-17 |

**Description.** `repid_delta_applied` on a `repid_score_events` row is documented
as *"what actually MOVED the score."* It does not, at or near an agent's earned
floor — **two floors, only one binds:**

- The JS pipeline writes the event's `repid_after` / `repid_delta_applied` from
  `applyToScore() + clampRepidLoud()`, which clamps to a **global `REPID_MIN`**.
  It then `UPDATE`s `repid_agents.current_repid`.
- The DB trigger **`trg_repid_earned_floor`** (BEFORE UPDATE OF `current_repid`)
  re-clamps that write **up** to the peak-based `tier_lower_bound(peak_repid)`.

When `tier_lower_bound(peak) > REPID_MIN` — any agent that earned above the bottom
tier — a below-floor penalty is absorbed (the live score does not move) but the
event keeps the full negative delta.

**Evidence (VERIFIED via service-role SQL, `repid-engine-ledger-divergence.json`).**
`tier_lower_bound`: `≥8000→8000, ≥5000→5000, ≥1000→1000, ≥500→500, else 0`.
`trg_repid_earned_floor` raises `current_repid` to `coalesce(floor_override,
tier_lower_bound(peak_repid))`. Deterministic behavioural proof on a throwaway
(created + tested + deleted in one block):

```
wrote 990  (peak 1000, floor 1000)  -> live current_repid = 1000   (clamped up)
wrote 1200 (reward)                 -> live = 1200, peak ratchets to 1200
wrote 950  (peak 1200, floor 1000)  -> live = 1000   (clamped)
wrote 400  (deep penalty)           -> live = 1000   (clamped)
```

And the grief-test event: stored `repid_after = 990, repid_delta_applied = -10`
while live `current_repid = 1000` — **actual movement 0.**

**What this does NOT establish.** REPID-ENG-003 itself is an audit-accuracy defect,
**not** independently exploitable. But the earned floor it rests on is only a
**partial** protection for REPID-ENG-001: it caps a griefing drain at the floor
(zero only for the 12/176 agents already there), it does **not** make the live
score unreachable — see the corrected magnitude table above. The reconciliation tripwire
`appliedScoreReconciles()` does not catch it: it checks the JS decomposition's
internal consistency, not the JS `after` against the post-trigger live value.

**Impact.** Audit accuracy: `repid_score_events` cannot be summed to reconstruct
`current_repid`, and a penalty event overstates a drop the live score never took.
It is also what makes REPID-ENG-001's event-log pollution look worse than the live
effect. This is the codebase's named recurring class — a system reporting an
outcome (a penalty) it did not actually apply — in the reputation ledger.

**Recommended fix.** Clamp the JS applier to the **same** floor the trigger uses
(`coalesce(floor_override, tier_lower_bound(peak_repid))`) so the event's
`repid_after` / `repid_delta_applied` equal the real post-trigger movement; or
store the calculated and the true-applied values under distinct, labelled fields.
The DB trigger is the source of truth; the event should mirror it.

**Re-test.** `npm run check:redteam -- --probe REPID-ENG-003`; HELD once a
recorded sample's `repid_after` equals the live `current_repid`.

---

## The `/complete` LLM proxy — investigated 2026-08-17 (no breach; one Low note)

The trustshell campaign flagged three concerns for `/api/v1/llm/complete`: user
API-key handling, free-tier cost gating, and prompt-injection into HAL. Source
review at `0b4b391` (= live) plus two **safe, write-free** live probes. Result:
**all three held**, and one of them refuted a scary source pattern by execution.

**Key handling — HELD.** BYOK custody (encrypted at-rest storage,
`byok-custody.ts`) is future/inert (`BYOK_CUSTODY_ENABLED` default OFF), so today
`user_paid_keys` is read from the request body, used in-memory for the provider
call, and `req.body.user_paid_keys` is set to `'[REDACTED]'` (route.ts:231) so any
downstream/error logger sees the redaction. I checked the failure path
specifically — the redaction sits *after* awaited DB calls that can throw, but the
outer catch emits only `error.message`, and no logger (`anfis_routing_logs`,
`logLlmCall`, tool-call-logger) is passed the keys. Matches the privacy posture.
*Caveat:* the **prompt** is logged in previews (`prompt_preview` 200 chars,
`request_text` 500) for routing analytics — disclosed, and separate from keys.

**Free-tier gate — HELD, and this one is the "run it" story.** The gate keys
anonymous callers by IP (`meterRun`, `i:${ip}`, 5 runs/IP/day) and derives the IP
from `x-forwarded-for.split(',')[0]` — a classically **spoofable** pattern. So I
tested it: three POSTs with spoofed `X-Forwarded-For` (`.11`, `.11`, `.22`), empty
body (400 before any LLM call). The `x-taste-remaining` header came back **4, 3,
2** — one monotonic counter across two *different* spoofed IPs. A working spoof
would have reset the `.22` request to 4; it continued to 2. **Railway's edge
normalizes `X-Forwarded-For`, so `split(',')[0]` is the real client IP and the
gate is not bypassable here.** The source looked vulnerable; the deployment is not.

> **HDN-001 (Low, informational, not ledgered — currently HELD).** The gate's
> correctness depends on the edge proxy normalizing XFF. Behind a proxy that
> *appends* (preserving a client-supplied leftmost), it would become bypassable →
> unbounded free-tier LLM cost/DoS. Harden by deriving the IP from Express
> `req.ip` with an explicit `trust proxy` hop count rather than raw
> `x-forwarded-for[0]`, so the control does not depend on edge behavior.

**Impersonation — HELD.** The F2 fix (2026-06-01) enforces the `agent_id` binding
on every auth path: an agent-scoped key must match its bound agent (403), a shared
`REPID_API_KEYS` env key may not target a specific `agent_id` (403), and
`llm_complete` scope is required (403 if missing).

**Prompt-injection into HAL — OUT OF PATH.** `/complete` routes the prompt to an
LLM provider (a standard proxy); HAL scoring is the separate `/score-event` call
(REPID-ENG-001/003). No privileged HAL decision is taken inside `/complete`.

Evidence: `scripts/redteam/evidence/repid-engine-complete-proxy.json`. Side effect:
consumed 3 of 5 anon runs for the Supabase egress IP today (in-memory counter,
self-resets at UTC rollover); no DB rows written.

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
