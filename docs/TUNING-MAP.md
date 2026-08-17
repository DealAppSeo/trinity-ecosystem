# Tuning map — MEASURED / GATED / TUNABLE / DARK

First draft, 2026-08-17. **Every number here was measured against the live
database on that date.** Where a thing could not be measured it says DARK and
names what would light it, rather than estimating.

This exists so the sprint chooses what to tune from evidence instead of from
whichever lever is nearest to hand.

## The four states

| state | meaning | what you may do |
|---|---|---|
| **MEASURED** | a real run produced the number, and it can be reproduced | tune against it |
| **GATED** | measurable, but blocked on a credential, a setting or an owner | unblock first; do not estimate |
| **TUNABLE** | a knob exists, is reachable, and its effect is observable | change it, with a held-out split |
| **DARK** | no measurement exists and none is currently possible | **do not tune. Do not quote a number.** |

**A DARK lever with a plausible number attached is the most dangerous object in
this system.** It is indistinguishable from a MEASURED one in a slide.

---

## The map

| lever | state | evidence / what blocks it |
|---|---|---|
| **Issuer accuracy (HAL)** | **GATED** | 147,704 classifications exist; **0 receipts minted**. Needs `TRUSTSHELL_HMAC_SECRET` + `SUPABASE_SECRET_KEY` — `docs/HAL-REPLAY-CHECKLIST.md`. `hal_validation_runs` holds 4,057 rows across 14 runs / 3 harness versions and is the only accuracy signal that exists today. |
| **Pooled `hal_score` as an accuracy proxy** | **DARK — actively misleading** | Pooled, it **anti-correlates** with correctness; stratified by `hal_decision` it correlates correctly in *both* strata. Simpson's paradox. Never quote the pooled figure. |
| **HAL flip rule (in-sample gain)** | **RETRACTED as a tuning target** | **+9.26pp in-sample → +0.16pp on a run-split holdout.** Any future HAL tuning must be split before it is believed. |
| **`1.0.0-held-out-weights` vs baseline** | **MEASURED — no effect** | 75.96% vs 63.33% **reverses** to 78.70% vs 83.33% same-provider. Paired on 36 cases: **−4.63pp**, sign test **p ≈ 0.51**. Do not ship it as an improvement. |
| **Derived "margin" (score agreeing with decision)** | **MEASURED — usable** | Accuracy rises monotonically **12.2% → 83.0%** across margin bands. The one signal found today that discriminates. |
| **No-provider veto rate** | **DARK** | 41 vetoes fired on rows where the detector called no provider (other lane). Rate not computable until the replay corpus exists. |
| **RepID floor-sitters** | **MEASURED — and it is severe** | **101 of 176 agents (57.4%) sit in 499–505**; another **23 (13.1%) at exactly 200**. So **~70% are parked at seed-looking values** and RepID is not discriminating for them. 41 distinct values across 176 agents; range 60–10,000; **0 agents have `floor_override` set**. |
| **`DEFAULT_WEIGHTS`** | **TUNABLE — but FROZEN by instruction** | Do not touch. Listed so nobody "discovers" it as an easy lever. |
| **RepID event supply** | **GATED** | `repid_score_events` holds **152,158** rows but is fed by the same stopped mesh as HAL — see Railway below. Scores are computed over a corpus frozen since 2026-07-17. |
| **Doer-seat reputation signal** | **GATED — cross-lane** | `REPUTATION_SIGNALS` closed at seven, **none doer-side**. Adding to `repid_score_events.event_type` is Sean-gated DDL; adding to `ReputationSignal` is not a unilateral decision. |
| **BFT observation presence** | **DARK** | **0 of 12** receipts carry a non-null `bft_passed`. No panel has ever voted into this table. BFT firing needs `LITELLM_MASTER_KEY` and a reachable `trinity-litellm.railway.app`. |
| **Selective-disclosure readiness** | **GATED** | The production `IBindingScheme` throws `MISSING_PARAMETERS` pending Poseidon2 from the other lane. Cost is expressed in **hash calls**, not milliseconds, precisely because the hash is not chosen yet. |
| **Ceiling source (row vs ladder)** | **NEEDS DISAMBIGUATION** | Not resolved in this lane; another lane's PR #55 touched the tier ladder. **Do not tune against a ceiling without first stating which source produced it** — the repo has already retracted figures for exactly this class of ambiguity. |
| **CI reliability** | **MEASURED — partially, and one half is DARK** | `workflow_dispatch` **proven** 2026-08-17 (run 31987897155: `run_started_at == created_at`, no hold). Bot-attributed `pull_request` runs → `action_required`, cause confirmed. **DARK:** why User-attributed pushes stopped creating `pull_request` runs after 16:28 — no mechanism, deliberately not theorised. |
| **Replay availability** | **GATED** | Writer built, asserted, refusing to start. Four refusal paths run. See the checklist. |
| **Railway fleet health** | **DARK — operator-only** | See below. |
| **Agent liveness as a health signal** | **MEASURED — and it is a LIE** | All **12** agents report `status = 'online'`; the newest `last_ping` across all of them is **2026-07-17 22:18:57**, thirty days stale. `agent_heartbeat.status` is a stored string nothing updates. **Never use it as a health signal.** |
| **Throughput (does a producer still produce)** | **MEASURED — the honest replacement for liveness** | `public.throughput_declarations` + `throughput_observe()`; `npm run check:throughput`. Four declared states; a synthetic canary never counts as output. |

---

## Railway stoppage — everything reachable without new credentials

**P2. Gathered 2026-08-17 from the database only.** No Railway surface is
reachable from an agent session, so nothing here comes from Railway itself.

### What the data shows

| signal | value |
|---|---|
| Last real work | task 434972 at **22:03:50**, no error row |
| All 12 agents' `last_ping` frozen within | **22:18:09 – 22:18:57** (48 seconds) |
| First `survivor_alert` | 22:28 |
| `agent_heartbeat.status` today | **`online` — for all 12, 30 days stale** |
| HAL/day 07-15 → 07-16 → 07-17 → 07-18 | **2,689 → 1,707 → 1,360 → 2** |
| HAL/day now | **1–3**, all the 09:15 UTC canary |

### The finding that is new today

**The fleet was already degrading two days before it stopped.** 2,689 → 1,707 →
1,360 is a **49% decline across 07-15 → 07-17**, before the 07-18 collapse to 2.
A stop-from-outside explains the cliff; it does not explain the slope leading
into it. That slope is unexplained and is a second question, not the same one.

It is also the reason the throughput ledger's `degradedBelow` default is 0.5 —
that threshold fires on **07-16**, two days before any liveness check noticed
anything.

### What heartbeats claimed vs what CI would have claimed

- **Heartbeat:** `online`, continuously, for 30 days. Wrong.
- **Railway / UptimeRobot / `/health`:** all green. All three measure
  **liveness**, and the containers' liveness is not the question.
- **A throughput check would have fired on 07-16**, before the outage, on the
  slope rather than the cliff.
- **CI has nothing to say here.** This is production, not a build. Do not read a
  green pipeline as evidence about the fleet.

### Operator-only, and unchanged

**Why Railway stopped the containers at 22:18 remains NOT CHECKED.** Ruled out
by evidence already: pg_cron (no job stopped; the `*/25` auto-healer died
2026-05-20), the database (idempotency counter continuous `…434975` → `…434976`
— the queue was not drained, it **stopped being fed**), `global_pause` (false),
an app crash (no error row, work stopped mid-stream). Every alert since says
*"Manual redeploy required. Autonomous redeploy disabled."*

Answering it needs a Railway surface: deploy history, container exit codes,
billing/quota state at 22:18 UTC on 2026-07-17. None is reachable from here.

---

## What to tune next, if the map is taken at face value

1. **Unblock the replay.** Two environment variables convert the largest lever
   on the board from GATED to MEASURED. Nothing else on this list has that ratio.
2. **Set the three judge variables.** `reject-only` is an incomplete feedback
   loop — a judge that can only reject cannot improve work quality over time.
3. **Then look at floor-sitters.** 70% of agents parked at seed values is either
   a real signal that most agents do nothing, or a scoring path that never
   fires. **Which one it is, is currently DARK** — and it is the most
   interesting question on this page.

Do not start at (3). Its answer depends on an event supply that is frozen.
