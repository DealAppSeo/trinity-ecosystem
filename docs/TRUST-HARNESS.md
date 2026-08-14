# The portable trust harness

`lib/trustshell/harness/` — a dependency-free reputation and fault-tolerance
layer that other trust systems can adopt. RepID as a package rather than a
Trinity feature.

Thirteen modules, no imports outside the directory, no Node built-ins, no
`process.env`. `npm run check:harness-portable` fails the build if that stops
being true.

---

## The one idea

**Self-report cannot reach a ranking. Only earned outcomes can.**

Every mechanism here follows from that, and from its corollary: a score must
carry how much evidence stands behind it, because a number reported with more
confidence than it earned poisons everything downstream — routing, quorum
weight, tier, payout.

## Modules

| module | fixes |
|---|---|
| `types.ts` | Portability constraint; earned/perceived split; NaN-safe cosine |
| `reputation.ts` | Confidence-weighted earned score, shrinkage, UCB |
| `leaky-bucket.ts` | Token routing bottlenecks |
| `capacity.ts` | Dynamic slots from latency; silent degradation |
| `router.ts` | Top-K alternates, cold start, attribution |
| `queue.ts` | Pull scheduling, visibility timeout, dead letters |
| `circuit-breaker.ts` | Expert failure isolation with labelled fallback |
| `quorum.ts` | PBFT supermajority, rubric judging |
| `replay.ts` | Self-healing state replay |
| `timeout.ts` | Run/idle deadline split; catches an expert that hangs |
| `transform.ts` | Middle-out context compression with a reported ratio |
| `aggregate.ts` | Weighted-plurality MoA aggregation; earned weight, not head count |
| `escalate.ts` | When a panel is worth paying for; budget cap that reports refusals |

## Measured results

`npm run sim:harness` — 2000 tasks, 8 experts, virtual clock, deterministic.
Both arms see an identical seeded workload; only the routing and
fault-tolerance layers differ. The baseline is modelled on what the surveyed
frameworks actually do: greedy top-1 on a self-declared score.

Seed 20260813:

**Measured at `confidenceK` 20, the default since 2026-08-13.** The previous
figures in this table were taken at 50; see the tuning note below.

| metric | baseline | harness | delta |
|---|---|---|---|
| correctness rate | 41.9% | **92.3%** | +120.4% |
| completion rate | 92.8% | 100.0% | +7.7% |
| unrecovered failures | 143 | **0** | −100% |
| calls per task | 1.26 | 1.02 | −19.0% |
| load Gini (0 = even) | 0.824 | 0.663 | −19.4% |
| max single-expert share | 79.4% | 47.5% | −40.3% |
| calls to the degraded expert | 0 | **0** | — |
| calls to the crashed expert | 0 | **0** | — |
| p50 latency | 115 ms | 115 ms | 0.0% |
| p95 latency | 10000 ms | 161 ms | −98.4% |
| p99 latency | 10000 ms | 179 ms | −98.2% |

Across the five published seeds the harness scores 91.0–92.9% against a baseline
of 40.9–42.6%. The effect is not seed luck.

**What changed when `confidenceK` went 50 → 20**, and it is more than the
headline: correctness 89.0% → 92.3%, p99 **794 → 179 ms**, p50 127 → 115 ms,
max single-expert share 66.0% → 47.5%, and calls to the silently-degraded expert
**50 → 0**. Faster reaction to evidence means the harness stops feeding
`decayer` before its 6× latency lands in the tail.

**Read the delta column with care — two of these moved for reasons that are
not the harness getting better.**

*The baseline got worse, the harness did not get better.* The `stalled` expert
was added on 2026-08-13 to exercise the timeout module, which took the world
from 7 experts to 8. The harness went 88.8% → 89.0%, i.e. flat. The baseline
went 48.3% → 41.9%, because a hanging expert that claims 9000 consumes its
retry slot. The delta grew from +83.7% to +112.7% **entirely because the world
got harder for the baseline specifically**, and reading that as the harness
improving would have been measuring the workload, not the mechanism. (It reads
+120.4% today, but for a different and legitimate reason — the `confidenceK`
change below, which moved the harness arm rather than the baseline.)

*The baseline's p95/p99 of 10000 ms is a chosen constant, not a measurement.*
Its tail collapses onto `RUN_TIMEOUT_MS` because hangs are 5.2% of its calls, so
anything above the 95th percentile *is* a hang and costs exactly the run
deadline we credit it with. Set that constant to 2000 and the baseline p99 reads
2000. **A metric whose value equals one of your own configuration constants is
not a measurement of anything.** Compare against the 7-expert baseline's real
141 ms instead.

**The tail-latency cost was mostly a tuning artefact, not an inherent price.**
This document argued for two revisions that correctness is bought with tail
latency, quoting a +446% p99 regression (141 → 770 ms). Against that same 141 ms
reference the harness now sits at **179 ms, +27%** — the residual cost of
exploring unknowns, and roughly a sixth of what was claimed. The rest was
`confidenceK` 50 reacting too slowly to `decayer`, so 50 calls landed on a
6×-latency expert. At 20 that number is 0. The regression was real when
measured; it was not intrinsic, and the earlier framing of it as the honest
standing cost of correctness was too pessimistic.

The two headline numbers:

- **`boaster`: claims 10000, earned 4287, true quality 0.35.** The baseline
  gave it 2000 of 2000 tasks. The harness gave it 25.
- **`rookie`: claims 0, earned 8516, true quality 0.95.** The baseline never
  called it once. The harness gives it **737 of 2000** calls — second only to
  `alpha`, and at `confidenceK` 50 it took 43.

Kendall tau between learned rank and effective quality: **0.643** — *unchanged*
on this seed by the `confidenceK` move, despite correctness rising 3.3 points.
The tau gain reported by the sweep (0.693 → 0.800) was a ten-seed mean in the
counterfactual world; a single seed shows none of it. Correctness and ranking
quality are not the same measurement and do not move together, which is the
whole reason both are tracked.

### The timeout module, measured against itself

The baseline-vs-harness table above cannot say what `timeout.ts` contributed,
because it differs from the baseline in nine other ways at the same time. The
honest test is an ablation — the same harness, same world, same seeds, with the
timeout policy switched off:

```bash
npm run sim:harness -- --no-timeout
```

| seed | correctness off → on | hangs off → on | stall seconds off → on |
|---|---|---|---|
| 20260813 | 91.8% → 92.3% | 4 → 1 | 40.0 → 1.5 |
| 1 | 91.5% → 91.6% | 11 → 3 | 110.0 → 4.5 |
| 2 | 91.6% → 91.0% | 2 → 1 | 20.0 → 1.5 |
| 3 | 92.5% → 92.9% | 8 → 1 | 80.0 → 1.5 |
| 4 | 92.0% → 92.0% | 0 → 0 | 0.0 → 0.0 |

**Aggregate correctness moves −0.6 to +0.5 points, which is inside seed noise
and includes one seed where it is nominally worse.**
On this workload the module does not measurably improve the answer rate, and
saying otherwise would be reporting a rounding error as a result. The reason is
worth stating because it is a compliment to the rest of the harness: the router,
the trust floor and the ledger already suppress `stalled` to about 1.4% of
traffic, so there is very little hang left for a timeout to catch.

What the ablation *does* establish:

- **Stall time falls 92–98% on every seed that had a hang at all**, and seed 4
  now has none, so there is nothing to save there. The per-hang share of that
  is exactly `1 − 1500/10000 = 85%` — the ratio of the two constants, true by
  construction. Only the variation above 85% comes from hang counts.
- **Nothing regresses beyond noise.** Seed 2 is nominally −0.6pp on correctness;
  the seed spread is 2.3pp, so that is not a real regression, and it is recorded
  rather than dropped because dropping the one unfavourable row is how a table
  stops being evidence.
- **No leaked attempts.** The simulation prints `timeouts.inFlight()` at the
  end. With the policy on it is **0**; with `--no-timeout` it is **4** on seed
  20260813 — exactly the four hangs, still held open at the end of the run.
  That is the clearest single demonstration of what the module does: without
  it those attempts are never resolved by anything, and each one is a slot and
  a reputation the rest of the harness will never get back.

So the case for the module is not the aggregate numbers. It is that a hang is
invisible to every other layer — the breaker only learns from `recordFailure`,
the governor only samples on completion, the ledger only learns from outcomes —
and none of them fires on a call that simply never returns. The timeout
manufactures the one signal they all need.

### Hang under trust — where the timeout actually pays

The default pool cannot show this, because `stalled` is demoted within a few
calls. The case the module exists for is an expert that has **earned** its
standing and then goes bad. `npm run experiment` section (d) models it: a
`veteran` of true quality 0.97, warm-started with 400 good observations so it
arrives as an incumbent, which then hangs on half its calls from 75% onward.
Ten seeds, timeout off versus on:

| metric | timeout OFF | timeout ON | delta |
|---|---|---|---|
| calls to veteran once bad | 336 | **6** | −98.2% |
| hangs encountered | 166 | 3 | −98.5% |
| wall clock lost to hangs | 1,661 s | 3.8 s | −99.8% |
| p99 latency | 10,000 ms | 434 ms | −95.7% |
| Kendall tau | 0.629 | **0.657** | +4.5% |
| unrecovered failures | 0 | 0 | — |
| correctness rate | 94.0% | 93.5% | **−0.57pp** |

**Correctness does not improve, and nominally falls.** The −0.57pp is inside the
2.3pp seed spread, so it is not a real regression either — but the honest
statement is that **the timeout buys nothing in correctness here**. Without it a
hang still costs the task nothing: the attempt is abandoned by the outer run
deadline and the retry usually succeeds. Correctness is preserved at ruinous
cost, which is precisely why correctness is the wrong metric for this module.

What it does buy is everything else, and the tau row is the one that matters
most. **Without the timeout the reputation ledger is silently poisoned**: the
veteran keeps a high earned score forever while delivering nothing, because a
hang produces no outcome to learn from. Ranking quality falls from 0.657 to
0.629. A hang is not only wasted latency, it is a lie the ledger cannot detect —
and the ledger is the thing the whole harness rests on.

**That tau gap narrowed sharply when `confidenceK` moved 50 → 20** — it was
0.579 vs 0.436, and is now 0.657 vs 0.629. A ledger that reacts faster to the
evidence it *does* get is less damaged by the evidence it never gets. The
poisoning is real either way; a well-tuned ledger is simply less poisonable, and
the earlier +32.8% figure overstated the module's contribution because it was
measured against a badly-tuned control.

**The scenario carries a validity guard, because the first two attempts at it
silently failed.** It asserts the veteran took ≥200 calls and reached ≥0.80
confidence *before* going bad, and refuses to print an ablation otherwise. Attempt
one gave it quality 0.93 and `hangsAt` 0.6; it took 4 calls all run and 0 before
going bad — a cold staller under a different name, which still produced a
confident, meaningless table. Attempt two made it the best expert in the pool and
it still took 1 call, which exposed something worth knowing on its own: **with
default parameters a cold expert takes almost no early traffic at all** (`rookie`
also took 0 calls in the first 60% of a run). No newcomer can build trust inside
the run, so the incumbent had to be warm-started.

### Context-bloat control, measured on its own model

The routing simulation has no message dimension, so it cannot say anything
about `transform.ts`. This is a separate measurement in the same script: a
conversation grown over 400 turns against a 4000-token budget, with a pinned
system prompt and a tool-call pair every third turn.

| metric | untransformed | transformed | delta |
|---|---|---|---|
| peak context | 94,344 tokens | 4,000 tokens | −95.8% |
| mean context | 48,705 tokens | 3,888 tokens | −92.0% |

Mean compression ratio (retained/original) **0.159**. On the final turn, 36 of
935 messages are retained. Peak lands exactly on the budget, so the budget is
the binding constraint rather than an aspiration.

**The integrity counters matter more than the compression.** Across all 400
turns: **pairs split 0, pinned messages lost 0, turns over budget 0.** Those are
not tradeoffs that could be tuned — a tool call separated from its result, or a
discarded system prompt, is a defect that would make the compression ratio look
*better* while corrupting the conversation. They are counted every turn rather
than asserted once.

The reported drop count is deliberately **not** cumulative. Each turn
re-transforms the whole conversation, so summing per-turn drops counted the same
message hundreds of times and read 173,800 for a run containing 935 messages —
a number that looks impressive and means nothing. Third instance today of the
same wrong-metric shape, this time in the reporting rather than the code.

### The MoA panel — a negative result, and what it redirected to

`QuorumEvaluator` shipped with 46 assertions and was imported by the simulator
without ever being called. Wiring it up (`npm run experiment`, section e) routes
to a panel of K and aggregates instead of taking top-1. Ten seeds:

| panel | via quorum gate | Δ vs top-1 | calls/task | p99 |
|---|---|---|---|---|
| top-1 | 91.8% | — | 1.02 | 193 ms |
| 2 | 77.9% | −13.83pp | 2.00 | 213 ms |
| 3 | 84.5% | −7.31pp | 3.00 | 632 ms |
| 4 | 80.3% | −11.49pp | 3.98 | 959 ms |

**A clear loss — and the diagnosis matters more than the number.** Per 2000
tasks the panel produced only ~16 REJECT rounds but **~424 INDETERMINATE**. It
almost never agrees on a wrong answer; it fails to reach the 2/3 supermajority,
and a gate that abstains was scored as wrong.

So this measured a fail-closed unanimity gate, not aggregation. Scoring the
**identical votes** under plurality semantics — what an MoA aggregator actually
does — inverts the result:

| panel | gate | plurality | Δ vs top-1 |
|---|---|---|---|
| 2 | 77.9% | **95.4%** | +3.62pp |
| 3 | 84.5% | **96.8%** | +5.00pp |
| 4 | 80.3% | **98.3%** | +6.52pp |

**The entire difference between "aggregation is a disaster" and "aggregation is
worth +6.5pp" is which lens is applied to one set of votes.** Fifth instance of
the same lesson today, and the most expensive one had it gone unexamined: the
first table alone would have justified deleting `quorum.ts`.

The panel model is deliberately conservative — a wrong answer votes `reject`, so
wrong answers count as one agreeing bloc. In reality there are many ways to be
wrong and one way to be right, so incorrect answers scatter and the correct one
wins pluralities more easily than modelled. The +3.6 to +6.5pp is therefore a
floor, not a ceiling.

**The cost is real and is not netted out of the gain:** calls/task 1.02 → 2.00 /
3.00 / 3.98, p99 193 → 213 / 632 / 959 ms. MoA buys correctness with calls and
tail latency, exactly as the literature says.

`quorum.ts` is not wrong — it is a BFT commit gate and correct as one. It is
simply not an aggregator, and its guard refusing `supermajority: 0.5` ("must be
in (0.5, 1)") is right; the panel bent to the guard rather than the reverse.

### `aggregate.ts` — the module the negative result asked for

The panel experiment above said the missing piece was an aggregator, not a
wiring change. This is it: proposals clustered by answer, clusters weighted by
**earned** reputation, heaviest cluster returned. Ten seeds, `wrong=scatter`
(each wrong answer distinct, which is what actually happens):

| arm | default world | no-gem world | calls/task | p99 |
|---|---|---|---|---|
| top-1 | 91.8% | 89.2% | 1.02 | 193 ms |
| panel of 2 | 91.1% (**−0.65**) | 88.3% (**−0.93**) | 2.00 | 213 ms |
| panel of 3 | 98.5% (**+6.69**) | 97.1% (**+7.84**) | 3.00 | 632 ms |
| panel of 4 | 99.6% (**+7.79**) | 98.9% (**+9.73**) | 3.98 | 959 ms |

**It passes the counterfactual gate, and is stronger there** — with no planted
gem to find, top-1 is weaker and aggregation matters more. That is the opposite
of the `explorationRate` artefact, which evaporated under the same test.

**Panel of 2 loses in both worlds, and the cause is this module's own guard.**
`minProposals` defaults to 2, so when one member of a pair hangs or errors the
survivor is a lone proposal and the aggregator abstains — correctly, since one
proposal has 100% support by construction and says nothing. A pair has no
redundancy: any single failure drops it below quorum. **Do not run panels of 2.**

The diagnostic lens in the previous section predicted +3.62pp for panel-2 and
was wrong, because it counted a lone survivor as a correct answer. The shipped
module is more conservative than the estimate that justified building it, and
that is the right direction for an estimate to be wrong in.

**Answer-model sensitivity is bracketed rather than assumed.** `wrong=bloc`
treats every wrong answer as the same wrong answer; `wrong=scatter` gives each
its own. Panel of 3 reads 96.6% under bloc and 98.5% under scatter. Reality is
scatter — there are many ways to be wrong and one way to be right — so bloc is
the floor.

**The cost is not netted out:** 3–4× the calls and p99 193 → 632/959 ms. This is
the RouteMoA problem exactly, and the unbuilt answer to it is to screen cheaply
and escalate to a panel only when the prior is uncertain.

Two details worth keeping:

- **`dominatedBySingleExpert`** reports when one proposer outweighs all others
  combined — the panel cost K calls and returned what top-1 would have. It first
  measured the winning *cluster* against the rest, which made a two-expert bloc
  beating a lone heavyweight report `true`: the exact inverse of the truth. The
  name and the computation disagreed and a test caught it.
- **Ordering is total** — weight descending, then key ascending. Without the
  second key, equal-weight clusters fall back to `Map` insertion order and the
  same input yields different answers across runs.

### `escalate.ts` — screening, and an honest look at what it buys

`aggregate.ts` pays 3–4× on **every** task. RouteMoA's answer is to screen
cheaply and escalate only when the prior is uncertain, using signals that are
already computed — thin margin over the runner-up, low absolute earned score,
low confidence in the leader. Screening costs no calls.

Panel of 3, ten seeds:

| arm | correct | Δpp | calls/task | escalated | p99 |
|---|---|---|---|---|---|
| top-1 | 91.8% | — | 1.02 | — | 193 ms |
| panel always | 98.5% | +6.69 | 3.00 | 100% | 632 ms |
| escalate margin<1000 | 95.7% | +3.95 | 2.15 | 57% | **258 ms** |
| escalate margin<2000 | 97.9% | +6.12 | 2.83 | 92% | 360 ms |
| escalate conf<0.5 | 92.0% | +0.19 | 1.06 | 3% | 185 ms |
| escalate margin<2000, cap 25% | 92.4% | +0.58 | 1.50 | 25% | 211 ms |

**Do not read this as "screening is more efficient".** Gain per extra call is
3.51 for `margin<1000` against 3.38 for always-panel — a 4% difference, which is
nothing. Screening does not buy a better exchange rate between calls and
correctness.

**What it does buy is the tail: p99 632 → 258 ms, −59%**, with 28% fewer calls
and 41% of the gain forgone. On a workload where p99 is the binding constraint
that is a good trade; on one where correctness is, always-panel is still right.
The honest framing is that this is a **dial, not an improvement**.

**The rate cap is worse than useless as an allocator** — 1.21 pp per extra call
against 3.38 for always-panel. It spends its budget on the first qualifying
tasks, which early in a run are cold-start tasks where a panel of low-confidence
experts helps least.

**The obvious fix was built, measured, and removed.** A windowed-quantile
allocator was written to spend on the *most* uncertain tasks rather than the
earliest. On 20 mild then 5 severe tasks at a 20% cap:

| config | severe caught | mild burned | rate |
|---|---|---|---|
| floor 1000, greedy | 1/5 | 4 | 0.20 |
| floor 1000, **quantile** | **1/5** | **4** | 0.20 |
| floor 500, greedy | **5/5** | **0** | 0.20 |

**The quantile allocator produced exactly zero improvement, and a tighter floor
fixed the problem completely at the same cap.** It was removed rather than
shipped. The reason is not patchable: an online quantile is estimated from tasks
already seen, so it cannot reserve budget for a severity it has never observed —
mild tasks arriving first define the distribution, clear their own threshold, and
take the budget. A first attempt that selected on the quantile *alone* also
overshot the 20% cap to **68%**, because a tied mass of equally uncertain tasks
all clear a threshold equal to their own value.

**So: `maxEscalationRate` is a safety ceiling, not an allocator.** Bound
worst-case spend with the cap; decide what deserves a panel with the floors. The
`uncertainty` score survives as an observable — it is what diagnosed all of the
above, and it lets a caller see how far short a task fell rather than only
whether a boolean tripped.

**`conf<0.5` barely fires — 3% of tasks.** At `confidenceK` 20 confidence rises
fast, so almost nothing is below 0.5. The signal is not wrong; it is nearly
dead at the current default, and a floor tuned for `confidenceK` 50 would be
badly wrong here.

Counterfactual gate passed: in the no-gem world `margin<1000` gives +4.39pp
against top-1 (always-panel gives +7.84).

## Three build–measure–learn cycles, and what each taught

The tau figure took three iterations. Each one is a defect the simulation found
that reading could not.

**Cycle 1 — tau 0.429.** A raw EWMA has no notion of evidence, so an expert at
8108 on 118 observations outranked one at 6753 on 757. Fixed by empirical-Bayes
shrinkage toward a neutral prior, weight `n/(n+k)`. → **0.524**.

**Cycle 2 — tau dropped to 0.333, and the best expert in the pool collapsed
from 841 calls to exactly 15.** Shrinkage introduced a *cold-start cliff*: an
expert graduated out of exploration at a fixed observation count, but its score
was still shrunk too hard to compete, so it never earned the next observation.
Four of seven experts pinned at exactly the threshold. This is the failure mode
the brief names — "the router permanently ignores them" — reintroduced by the
fix for a different one. Tying the gate to *confidence* rather than a count
closes it, because confidence is the same quantity the shrinkage uses.

**Cycle 3 — the metric itself was wrong.** tau was computed against *nominal*
quality, so the harness was scored DOWN for correctly detecting that `decayer`
had collapsed to ~0.36 effective. Ranking now uses time-weighted effective
quality, and routing uses an upper confidence bound so optimism decays smoothly
instead of falling off a cliff. → **0.619**.

The through-line: two of the three were measurement or confidence defects, not
logic defects, and neither was visible by reading the code.

## What came from where

**LangGraph** (`langchain-ai/langgraph`, 450 py files, MIT):

- `RetryPolicy` — initial interval, backoff factor, max interval, jitter, and a
  `retry_on` *predicate* rather than an exception list.
- `TimeoutPolicy` — the distinction worth stealing: `run_timeout` is a hard
  wall-clock cap, `idle_timeout` fires on absence of *observable progress*,
  refreshed by callbacks or explicit heartbeat. A hard timeout alone cannot
  catch an expert that is slow but alive.
- `_internal/_replay.py` — replay restores the checkpoint from *before* the
  failure point, not the latest, and first-visit semantics stop a node inside a
  loop from rewinding forever. Both are in `replay.ts`.
- `errors.py` — control-flow signals (`GraphInterrupt`, `ParentCommand`) are a
  separate hierarchy from real failures (`NodeTimeoutError`), and `NodeError`
  is failure *context* handed to a handler rather than an exception to catch.

**crewAI examples** (`crewAIInc/crewai-examples`, 116 py files):

- Flows: typed Pydantic state with `@start` / `@router` / `@listen`. The router
  returns a *named branch*, which makes the state machine explicit.
- The shape actually borrowed: `self_evaluation_loop_flow` ends a bounded retry
  at an explicit `max_retry_exceeded` branch rather than raising. An exception
  gets caught somewhere generic and attributed to the wrong component; a named
  terminal state stays traceable. `queue.ts` dead-letters and `replay.ts`
  returns `replay_exhausted` for this reason.
- `@persist` for durable flow state.

**kyegomez/swarms** (reviewed earlier the same day, Apache-2.0) contributed the
negative space — three defects this harness is built to refuse:

1. `Task.correct_answer` threaded through ~20 call sites including the
   advertised MCP tool schema, compared to nothing. The only
   `if correct_answer:` is a debug log reading "Using correct answer for
   validation".
2. `agent_judge.get_reward()` scores by substring over the whole conversation.
   Executed: `"This is NOT correct."` → 1.
3. No persistence of agent performance across runs anywhere in the repo, so
   `AuctionSwarm`'s self-reported bid confidence is never reconciled against
   outcomes.

`quorum.ts` answers (2) with a rubric that only counts fully-numeric,
in-range dimension scores and records anything else as an **abstention, never a
zero**. `reputation.ts` answers (3).

## Epistemic rules, enforced by tests

Each has an assertion that fails if the rule is removed.

- **Liveness and consensus are tri-state.** `quorum.ts` returns COMMIT, REJECT,
  or INDETERMINATE. Too few validators is INDETERMINATE — with two outcomes, an
  infrastructure failure is recorded as a decision against the proposal.
- **PBFT needs n ≥ 3f+1.** Below it, a result is not weak, it is unsafe. The
  evaluator refuses to produce one.
- **Equivocation discards both votes.** A validator that voted twice has told
  us its votes are unreliable; keeping either is unjustifiable.
- **No evidence ≠ bad evidence.** Cold-start experts score at the midpoint, and
  the trust floor never excludes them — a floor applied to the unobserved is
  self-fulfilling.
- **A fallback result is labelled.** `viaFallback` rides on the value, and a
  fallback success never credits the expert.
- **A zero-row UPDATE is not a success.** `queue.ts` and the MCP heartbeat both
  return errors.
- **A baseline is never re-learned while degraded.** Otherwise an expert that
  slows permanently teaches the governor that slow is normal.

## Running it

```bash
npm run check:harness-portable     # dependency-free constraint
npm run check:harness-routing      # 45 assertions
npm run check:harness-consensus    # 46 assertions
npm run check:harness-timeout      # 29 assertions
npm run check:harness-transform    # 31 assertions
npm run check:harness-aggregate    # 28 assertions
npm run check:harness-escalate     # 22 assertions
npm run check:harness-reputation   # 22 assertions
npm run sim:harness                # E2E numbers
npm run experiment                 # parameter sweep + hang-under-trust scenario
npm run sim:harness -- --seed 7 --tasks 5000 --json
npm run sim:harness -- --no-timeout   # ablate the timeout policy
```

### Verified 2026-08-13

- `harness-routing` 45/45, `harness-consensus` 46/46, `harness-timeout` 29/29,
  `harness-transform` 31/31, `harness-reputation` 22/22, `mcp-fleet` 35/35 —
  **208 assertions, 0 failures**.
- `npx tsc --noEmit` — 25 errors, unchanged from baseline, none in new code.
- `npx next build` — clean.
- Portability check — 13 files, no external imports.
- Simulation across 5 seeds, results above.
- `harness-timeout` mutation-tested: three mutations applied to `timeout.ts`
  and each was caught. Refreshing `startedAt` from a heartbeat (the mutation
  that collapses the split into one deadline while still presenting two) failed
  3 assertions; removing the idle deadline failed 12; leaving swept attempts in
  the map failed 5. A suite that still passes with the feature deleted is not
  evidence, so this was checked rather than assumed.
- `harness-transform` mutation-tested: six mutations, five caught immediately —
  droppable pinned content (3 failures), pair-integrity guard removed (1),
  pairs ungrouped so a call can split from its result (2), summary tokens not
  charged (1), ratio computed on message count (1), `withinBudget` hardcoded
  true (3), head protection removed (6).

  **The sixth mutation exposed a real coverage gap and is why this list is
  worth reading.** Pinned messages are guarded twice — excluded from the
  droppable set *and* added to the protected set — so removing the second guard
  alone passed all 30 assertions and looked like an equivalent mutant. It is
  not: the protected set is also what seeds pair protection, so a **pinned tool
  call would silently lose its result**. A 31st assertion now covers it and the
  mutation fails. Mutation testing found a hole that writing more tests from the
  same mental model would not have.

**NOT CHECKED:** anything against live LLM experts. Every number here is from
the simulated world in `harness-simulate.mjs`, whose expert behaviour is a
model, not a measurement. The mechanisms are verified; the *magnitudes* are
only as good as that model.

## What REAL data says — and which published numbers were wrong

Everything above this section comes from the modelled world in
`harness-simulate.mjs`. On 2026-08-14 the harness was measured against
production data for the first time (`repid_score_events`, read-only). **This
section supersedes the scattered per-sprint claims in `SPRINT-LOG.md`, four of
which were retracted.** Read this rather than reconstructing the chain.

### Confirmed on real data

- **Empirical-Bayes shrinkage does what it was built for.** Ranked by raw
  success rate, eleven agents are joint-first at 100% — each on a *single*
  observation — while an agent with 14,715 observations sits at 22.9%. Through
  the ledger those eleven collapse to ~5014 (the 5000 prior) at confidence 0.05.
  A naive rate ranking would hand the fleet to one-shot claims.
- **The outcome enum cannot be trusted; the reputation delta can.** `flagged`
  (21,976 rows) carries **delta 0.00** — held for review, not wrong. `approved`
  and `correct` carry delta **−9.00**: positive names on penalties.
  `hallucination_caught` is non-null on every sampled row and agrees with
  `vetoed` 27,060/27,351, and is the label to use.
- **The fleet is two disjoint pools.** `peer_verify` (~30,600 events, ~21%
  success) is worked by exactly three agents that touch almost nothing else. A
  global earned score ranks across two pools the router never chooses between.
- **Domain-aware routing is worth +1.64pp, volume-weighted.** Ranks genuinely
  scramble across domains, but the high-volume domains carry the smallest gains.
  Not worth rekeying `ReputationLedger` for; the cheap fix is to stop ranking
  the `peer_verify` three against the other nine.

### Not answerable from this data

- **Co-failure correlation — the axis that decides whether panels pay at all.**
  `llm_call_id` is 1:1 with events; `prompt_text` repeats only because recurring
  cron jobs repeat, so grouping on it pairs agents that answered at different
  times about different data. Computing it anyway yields lift 1.283, **which is
  an artefact of the join and must not be quoted.** Needs a real task key on
  `repid_score_events`, or a join table linking events to task instances.
  Until then the Sprint O adaptive gate has to learn it online, which is what it
  was built for.

### Retracted — do not cite these

| claim | where | status |
|---|---|---|
| 100% of margins under `marginFloor: 2000` | Sprint S | **wrong** — computed with outcome order destroyed |
| Fleet improved recently, +2419 bps mean drift | Sprint T | **wrong** — 57 anomalous non-cron events dominated a 17-event EWMA window |
| 56% of margins under the floor | Sprint T | **wrong** — same contamination |
| `32e0e809` is the best cron performer (66.7%) | Sprint U | **wrong** — tail-150 windows spanned different time periods per agent |

The soundest margin figure is Sprint U's cron-only measurement (**91%** under
`marginFloor: 2000`, median margin 870 bps), and it inherits the unaligned-time
flaw above, so treat it as indicative. `marginFloor` has **not** been changed:
every cut of this data has moved the number.

### The methodological lesson, which cost four retractions

Each wrong number came from a transformation that looked harmless — interleaving
outcomes to recover a lost order, trusting `id` as a proxy for time, taking a
fixed-length tail from agents with wildly different volumes. **All three were
assumptions about the shape of the data, made without checking the shape.** In
every case the check was one cheap query.

The existing rule in this repo is *suspect the measurement before the code*.
Add: **suspect the sample before the measurement**, and treat a number carrying
a caveat as provisional until the caveat is paid.

## Not yet built

- **Sub-task routing granularity.** Routing is per task; the brief calls for
  sub-step and tool-call granularity. Highest-value remaining item by impact,
  but it reshapes the task model and `router.ts` rather than adding to them —
  **judged architecturally significant on 2026-08-13 and left for Sean**, not
  skipped.
- **Cold experts and early traffic — MEASURED 2026-08-14, and the answer was
  not the one expected.** At `confidenceK` 50 this was severe: across the first
  60% of a run both `rookie` and a newly added expert took **0 calls**. At 20,
  `rookie` takes 737 of 2000 calls and ends second in the pool.

  The open half — *can a newcomer added mid-run earn trust?* — is now answered
  by `npm run sim:newcomer`. **Yes, in 95% of 40 seeds**, refuting a closed-form
  prediction that it could not. The prediction assumed an incumbent's earned
  score sits at its true quality; under winner-take-all the leader's EWMA
  random-walks instead, so the 6775 bps graduation ceiling is real but does not
  bind. A late arrival pays a **lag**, not a lock-out — and that lag was
  **re-priced in Sprint Y and is nearly spent**. The 4.82pp first published here
  is **RETRACTED**: it was measured ranking by the point estimate rather than the
  `upperConfidenceBound` the simulator ships. Post-join the real gap is
  **0.45pp**, of which **0.18pp** is irreducible regret, leaving **0.27pp ±
  0.15pp**. `npm run sim:adoption` has the three levers tried against it and why
  none shipped.

  Looking for the lock-out found a different defect, which is now **fixed**: the
  router scored any cold expert at a flat 0.5, discarding all ~20 outcomes an
  expert produces before graduating. `ExpertProfile.observations` now separates
  *no* evidence from *thin* evidence. Worth **+0.85pp of the omniscient top-1
  bound** across 24 paired seeds (t = 2.92) — about a third of the remaining
  top-1 prize — with **no** effect on the panel arm. Sprint X in
  `SPRINT-LOG.md` has the four-world A/B and why this is not the planted-gem
  artefact that once fooled the `confidenceK` sweep.
- **Cancellation — accounted for, still not performed.** `TimeoutPolicy` reports
  expiry; it still cannot cancel the underlying call, because it holds no handle
  on the transport. What changed in Sprint K is that abandonment is no longer
  *silent*. `sweep()` moves the expiry into an abandonment ledger the caller must
  `settle()` as `confirmed_dead` / `returned_late` / `presumed_dead`, and
  `CapacityGovernor.strand()` holds the slot until `reclaim()` — so giving up on
  a call can no longer be mistaken for the call ending, which is what let a hung
  expert keep a slot the governor thought was free.
  **This measured as zero throughput improvement** and was kept on correctness
  grounds only; `capacity.observe(…, ok=false)` already collapses a hanging
  expert to `minSlots` before the stranding can block anything. See Sprint K in
  `SPRINT-LOG.md` for the numbers and the two wrong guesses that preceded them.
  Still open: actually cancelling, and any caller outside the simulator —
  `lib/mcp/fleet.ts` has no in-flight accounting to strand.
- **Summarisation quality.** `transform.ts` accepts a `summarise` callback and
  charges its tokens, but supplies none — the dropped middle is simply gone
  unless a caller provides one. Nothing measures whether a summary preserves
  what the dropped turns contained, which is the part that would actually need
  an LLM and an eval.
- **Persistence — reputation done, the rest not.** `ReputationStore` is
  implemented against `agent_repid` in
  `lib/trustshell/persistence/supabase-reputation-store.ts`, and **blocked on
  an unapplied migration** (below). `FleetSource` and `CheckpointStore` still
  have no Postgres implementation; `circuit-breaker.ts` already mirrors the
  `circuit_breakers` table's columns, so that one should be short.
- **The reputation store cannot run yet.** `agent_repid` has no
  observation-count column, and the ledger's confidence is `n / (n + k)`. A
  restored ledger without `n` has confidence 0 and every earned score collapses
  to the prior — a silent erasure of the fleet's entire track record by a load
  that appears to succeed. The store refuses to load or save until the column
  exists rather than defaulting `n` to 0.
  `supabase/migrations/20260813210000_agent_repid_earned_observations.sql` is
  **written and deliberately not applied** — additive, one nullable integer
  plus a non-negative check, with rollback in the header. Applying it is Sean's
  call.
- **`perceived_score` is still not written by anything here**, on purpose. The
  ledger holds only earned outcomes, so it has nothing to say about the
  perceived column and must not overwrite whatever maintains it.
- **x402 / ERC-8004 binding, and ZK bind/unbind to humans.** Not started. The
  ledger is the substrate they attach to.
