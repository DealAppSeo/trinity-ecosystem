# Decay-unless-re-earned: the shape is decidable, the rate is not

**Design note, 2026-08-17.** Nothing in this change is wired: no trigger is
altered, no row is written, no floor moves. It builds the half of the design that
can be settled without a population, and states precisely why the other half
cannot be.

Prior work this rests on: `docs/REPID-TIER-WRITE-PATH-2026-08-17.md` (#81) mapped
the ratchet and its trigger chain. Everything below re-measured from the live
database rather than inherited.

---

## 1. The premise did not survive measurement

This was scoped as *"decay-unless-re-earned against the 21 live floor-sitters."*
#81's count reproduces exactly — 176 agents, 21 sitting on a floor value, 13 with
`peak_repid > current_repid`, 0 below their floor, 0 with a `floor_override`.

But **"21 floor-sitters" is not 21 agents being held up**:

| | count |
|---|---|
| sitting on a floor value (500/1000/5000/8000) | 21 |
| mock / smoke / dry-run / `test_only` / named `HUMAN` | **20** |
| `peak_repid IS NULL` — **no ratchet applies at all** | 9 |
| **genuinely ratcheted** (`peak_repid > current_repid`) | **1** |
| any activity in 30 days | **1** |

They are `mock-aggressive-*`, `trinity-mock-it-buyer-*`, `trinity-mock-fl-buyer-*`,
`z2 smoke agent`, `trinity-dry_run_agent_*`, and four rows literally named
`HUMAN`. Nine have no `peak_repid`, so they sit at 500 by **initialisation**, not
because a ratchet is holding them there.

**One real agent is held up: `trinity-gcm`** — `peak_repid` 1035 against a floor
of 1000. The ratchet binds it by **35 points, 3.4%**, nowhere near a tier
boundary. It is also the only floor-sitter with activity (67 in 30 days, last
active 16 days ago).

> **CORRECTED 2026-08-17 (VERIFY lane), evidence only — the design is unchanged.**
> The `any activity in 30 days = 1` row measures `repid_agents.last_active_at`,
> which is **not an activity signal**: it is written on **32 of 176** rows, is
> **NULL on 11 of these 12**, and is written by exactly one database function
> (`apply_linked_bet_resolution`) and zero lines of this repo. Measured against
> `v_agent_earned_observations` joined on `repid_agents.id`, **8 of the 12** were
> observed within 30 days, and **3** have no observation ever (all `test_only`).
> `trinity-gcm` has **33,434** observations all-time, **15** in the trailing 30
> days, and was last observed **within the hour**.
>
> This does not disturb the conclusion — the ratchet still binds one real agent
> by 35 points, and the rate is still not calibratable. It changes which column
> a wired rule may read: `last_active_at` reports 17 recently-active agents
> fleet-wide where the evidence shows 67, so keying decay on it would expire
> standing for agents that are demonstrably active. Now gated by
> `check:observation-identity`; see LESSONS A28.

## 2. And there is no existing decay to extend

Worth stating because the names say otherwise, and a reader who greps will
conclude the opposite [VERIFIED 2026-08-17]:

- **`repid_agents.decay_rate` is `0.0015` on all 176 rows** — one distinct value —
  and is read by **zero** database functions and **zero** lines of this repo.
- **`apply_repid_decay()` exists and decays `aidebate_users.repid_balance`**, a
  different product's table, by 1% per week of inactivity. It never touches
  `repid_agents`.
- **It is not scheduled.** No `cron.job` matches decay.

So this is not adding an escape valve to something running. Nothing decays on the
agent path today, and the column that looks like it configures decay configures
nothing.

## 3. What the design is

A floor is a claim that an agent **has** a level. That claim ages. The proposal is
not that standing rots on a timer — it is that a floor persists only while the
agent keeps demonstrating the level that earned it, and otherwise steps down one
tier at a time.

Three invariants, and they are the whole design:

**1. Decay moves the FLOOR, never the SCORE.** The score changes only through
scored events, which are the audit trail. A decay that edited `current_repid`
would manufacture reputation movement no event explains — the same defect as a
spending limit that changes because a writer touched a row (#82). Lowering a
floor lets a *future* penalty land; it does not itself penalise. `decideFloor()`
returns a floor and has no field that could carry a score.

**2. It steps by TIER, not continuously.** A floor at 7,431 is not a fact anyone
can act on, and a continuously drifting floor is unobservable between reads. One
tier boundary at a time is legible, reversible, and the granularity the ladder
already uses.

**3. It never falls below the level currently demonstrated.** If the live score is
at or above the floor, the floor holds — checked *before* the clock, so an active
agent is never expired for having a stale column. Decay removes a claim the agent
has stopped supporting; it cannot contradict one it is supporting now.

**Which ladder.** The DATABASE ladder — VETERAN/AUTONOMOUS/ESTABLISHED/EARNING at
8000/5000/1000/500 — not `TIER_LIMITS`' Platinum/Gold/Silver/Bronze at
7500/5000/2500/0. #81 measured both alive at once, agreeing on exactly one
boundary. The ratchet is a database mechanism, so the module uses the database
ladder and says so; "the tier" is ambiguous here and every claim has to name which.

## 4. The rate is refused, deliberately

`staleAfterMs` is **required with no default**, the same refusal `retry.ts` makes
for `retryOn` and `contracted-evaluator.ts` for `maxDisagreement`.

A half-life fitted to this fleet would be fitted to **one data point**, with the
other twenty being fixtures. A default would be a guess wearing a policy's
clothes, and it would silently govern every agent the moment it shipped. What
would make the rate calibratable is a population of real ratcheted agents — not
more code.

`maxStepsPerEvaluation` defaults to nothing either, and exists only so a backfill
can state a multi-step intent **explicitly** rather than by looping and hiding it.

## 5. Three outcomes, and NOT_CHECKED is the common one

`decideFloor` returns `holds` / `decays` / `not_checked`. The third is not
decoration: **`lastReEarnedAt` does not exist as a column today**, so an unknown
last-demonstration is the most likely production input by far.

- Folding it into `decays` expires floors for want of a timestamp nobody wrote.
- Folding it into `holds` reports a floor as examined-and-sound when it was never
  examined.

Both are the two-outcome mistake this repo keeps paying for, in opposite
directions. Wiring this therefore needs a new recorded fact — *when was this level
last demonstrated without being clamped* — which does not exist yet and is named
here rather than assumed.

## 6. A weak-mutation correction I made mid-build

Two of my four mutations initially **SURVIVED**, and both were my fault rather
than gaps — cause 3 on the harness's own list, which is why it says to check that
first.

- `floor-decay-expires-an-active-agent` replaced `current >= floor` with
  `current > peak`. My fixture was `(peak 8000, current 8200)` — a state the
  ratchet makes **impossible**, since it maintains `peak := greatest(peak,
  current)`. The mutant condition happened to be true for it, so the mutated code
  returned `holds` for the wrong reason and the suite stayed green. Fixed by using
  `current == peak`, which is the state that actually occurs.
- `floor-decay-steps-by-a-point-not-a-tier` changed `t.floor < floor` to
  `t.floor < floor - 1`. Tier floors are 3,000+ apart, so it selected the same
  tier and changed nothing. Replaced with one that returns `floor - 100`, a
  non-tier value, which invariant 2's assertion catches.

A fixture that cannot occur cannot protect an invariant — the same lesson as the
vacuous comment fixture in #76.

## 7. What this does NOT establish

- **It is not deployed and not wired.** No trigger changed. `check:dormancy`
  reports it as dormant-by-design, declared with this reason.
- **It does not choose a window.** See §4. That is an operator decision and the
  data to inform it does not exist.
- **It does not add `lastReEarnedAt`.** The column does not exist; §5 names it as
  a prerequisite rather than inventing it.
- **It says nothing about whether the ratchet should exist.** The ratchet's
  protective purpose is real; this is about whether its protection should be
  permanent.
- **It does not touch `app.bypass_repid_floor`.** #81 lists who may set that as
  an open question, and it is untouched here.
- **The 20 fixture rows are not cleaned up.** Whether mock and `test_only` agents
  belong in `repid_agents` at all is a data question, not a code one, and
  deleting rows is not something to do from an agent session.
