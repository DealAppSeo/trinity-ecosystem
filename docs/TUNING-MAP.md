# Tuning map — MEASURED / GATED / TUNABLE / DARK

First draft 2026-08-17, **revised the same day after merging `origin/main`**.
Two rows were corrected on merge — the no-provider veto rate and the ceiling
source — because another lane had measured what this map called DARK and
undecided. **That is the map working as intended**: a stale DARK is exactly as
dangerous as a stale number, and both are caught by re-reading the index before
shipping. **Every number here was measured against the live database.** Where a thing could not be measured it says DARK and
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
| **Fact-check quorum membership** | **MEASURED — and it is a leading indicator** | Recoverable from `hal_classifications.model`, which encodes participants. Gemini 2,653 → **0** on 07-14; qwen → **0** by 07-15; `fact-check-partial` appears the same day. Predicted the outage **four days early** and nothing watched it. Add it to the throughput ledger. |
| **No-provider veto rate** | **MEASURED — by another lane, 2026-08-17. This row was DARK when first written and is corrected here.** | On `fact-check-s2` (395 usable): HAL consulted NO provider on 59 rows and **vetoed 41 of them anyway — 19 hit a real hallucination, 22 hit a CLEAN answer**. Precision **46.3%**, AUC **0.5150** (chance). Where a provider ran: precision 0.9578, AUC 0.9746. **Not an outage** — `providers_attempted` is empty on all 59. **Cannot be applied to the LIVE path**: `repid_score_events` has no provider column, so unearned-ness is not distinguishable in production. `docs/HAL-UNEARNED-VETOES-2026-08-17.md`. |
| **RepID floor-sitters** | **MEASURED — and it is severe. Still DARK as to CAUSE, and another lane now names the same gap.** | **101 of 176 agents (57.4%) sit in 499–505**; another **23 (13.1%) at exactly 200**. So **~70% are parked at seed-looking values** and RepID is not discriminating for them. 41 distinct values across 176 agents; range 60–10,000; **0 agents have `floor_override` set**. The registry-drift lane records the matching unknown: *"what populates `repid_agents.tier`/`current_repid` ... is NOT CHECKED"*, and those columns use a DIFFERENT tier vocabulary (`ESTABLISHED`/`PROBATIONARY`) than `TIER_FLOORS`. **Two lanes have now arrived at the same missing writer from opposite directions.** |
| **`DEFAULT_WEIGHTS`** | **TUNABLE — but FROZEN by instruction** | Do not touch. Listed so nobody "discovers" it as an easy lever. |
| **RepID event supply** | **GATED** | `repid_score_events` holds **152,158** rows but is fed by the same stopped mesh as HAL — see Railway below. Scores are computed over a corpus frozen since 2026-07-17. |
| **Doer-seat reputation signal** | **GATED — cross-lane** | `REPUTATION_SIGNALS` closed at seven, **none doer-side**. Adding to `repid_score_events.event_type` is Sean-gated DDL; adding to `ReputationSignal` is not a unilateral decision. |
| **BFT observation presence** | **DARK** | **0 of 12** receipts carry a non-null `bft_passed`. No panel has ever voted into this table. BFT firing needs `LITELLM_MASTER_KEY` and a reachable `trinity-litellm.railway.app`. |
| **Selective-disclosure readiness** | **GATED** | The production `IBindingScheme` throws `MISSING_PARAMETERS` pending Poseidon2 from the other lane. Cost is expressed in **hash calls**, not milliseconds, precisely because the hash is not chosen yet. |
| **Ceiling source (row vs ladder)** | **DECIDED 2026-08-17 — TRUST THE ROW.** This row said NEEDS DISAMBIGUATION when written; the decision landed on main and is corrected here. | The stored `spending_limit_daily` / `spending_limit_per_tx` are authoritative; the ladder is a derivation and briefing aid, **never an enforcement source**. `updateRepID` now writes the SCORE ONLY. Gated by `check:ceiling-source`. **9 of 12 `agent_kya_registry` rows still disagree with `tierForScore`, every one permissively, and that is NOT repaired on purpose** — they are stable, not correct. `docs/REPID-REGISTRY-DRIFT-2026-08-17.md`. |
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

### The finding that is new today — and it is a SECOND, EARLIER failure

**The fleet was already degrading before it stopped**, and the cause is now
measured. `hal_classifications.model` encodes the fact-check QUORUM MEMBERSHIP,
so provider participation is recoverable per day:

| day | total | gemini | qwen | llama | glm | mistral | `fact-check-partial` |
|---|---|---|---|---|---|---|---|
| 07-13 | 2,683 | **2,653** | 1,799 | 1,355 | 2,072 | 2,683 | 0 |
| 07-14 | 2,683 | **0** | **177** | 1,275 | 2,249 | 2,424 | **259** |
| 07-15 | 2,689 | 0 | **0** | 1,331 | 1,863 | 2,209 | 479 |
| 07-16 | **1,707** | 0 | 0 | 994 | 1,376 | 1,530 | 177 |
| 07-17 | 1,360 | 0 | 0 | 841 | 1,068 | 1,221 | 139 |

**Gemini went 2,653 → 0 overnight on 07-14; qwen went 1,799 → 177 → 0 by 07-15.**
`fact-check-partial` — the system recording that it could not assemble a full
quorum — appears on **exactly** the day gemini vanishes, and never before.

The order matters and is the whole point:

1. **07-14/07-15 — two providers drop out.** Volume does NOT move (2,683 →
   2,689). The surviving providers absorb the work and quorums shrink.
2. **07-16/07-17 — throughput falls 36%** as the degraded quorum cannot keep up.
3. **07-17 22:18 — the containers stop**, killing the remainder.

So there are **TWO failures, not one**, and only the second was ever
investigated. Step 1 is provider attrition at the LLM gateway — a credential,
quota or rate-limit event on `trinity-litellm` — and it is **upstream of, and
independent of, whatever stopped the Railway containers**. Redeploying the fleet
without restoring gemini and qwen restores a degraded quorum, not the fleet.

**NOT CHECKED:** why gemini and qwen stopped participating. That needs the
gateway's own logs (`LITELLM_MASTER_KEY`, `trinity-litellm.railway.app`), which
is the same credential BFT firing needs. **Model diversity was a leading
indicator of the outage by four days and nothing was watching it.**

(The 2 rows on 07-18 show all five providers present — that is the 09:15 UTC
`e2e_smoke_nightly` canary on its own configuration, which is exactly why a
canary kept every liveness check green.)

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
