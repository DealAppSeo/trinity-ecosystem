# The portable trust harness

`lib/trustshell/harness/` — a dependency-free reputation and fault-tolerance
layer that other trust systems can adopt. RepID as a package rather than a
Trinity feature.

Nine modules, no imports outside the directory, no Node built-ins, no
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

## Measured results

`npm run sim:harness` — 2000 tasks, 8 experts, virtual clock, deterministic.
Both arms see an identical seeded workload; only the routing and
fault-tolerance layers differ. The baseline is modelled on what the surveyed
frameworks actually do: greedy top-1 on a self-declared score.

Seed 20260813:

| metric | baseline | harness | delta |
|---|---|---|---|
| correctness rate | 41.9% | **89.0%** | +112.7% |
| completion rate | 92.8% | 100.0% | +7.7% |
| unrecovered failures | 143 | **0** | −100% |
| calls per task | 1.26 | 1.03 | −18.0% |
| load Gini (0 = even) | 0.824 | 0.696 | −15.4% |
| max single-expert share | 79.4% | 66.0% | −16.9% |
| p50 latency | 115 ms | 127 ms | +10.4% |
| p95 latency | 10000 ms | 180 ms | −98.2% |
| p99 latency | 10000 ms | 794 ms | −92.1% |

Across five seeds the harness scores 86.8–90.1% against a baseline of
40.9–42.6%. The effect is not seed luck.

**Read the delta column with care — two of these moved for reasons that are
not the harness getting better.**

*The baseline got worse, the harness did not get better.* The `stalled` expert
was added on 2026-08-13 to exercise the timeout module, which took the world
from 7 experts to 8. The harness went 88.8% → 89.0%, i.e. flat. The baseline
went 48.3% → 41.9%, because a hanging expert that claims 9000 consumes its
retry slot. The headline delta grew from +83.7% to +112.7% **entirely because
the world got harder for the baseline specifically.** Comparing today's
+112.7% against yesterday's +83.7% as though the harness improved would be
measuring the workload, not the mechanism.

*The p95/p99 flip is an artefact of a chosen constant, not a speed-up.* The
harness did not get faster — its p99 went 770 → 794 ms. The baseline's tail
collapsed onto `RUN_TIMEOUT_MS` because hangs are 5.2% of its calls, so
anything above the 95th percentile *is* a hang, and a hang costs exactly the
run deadline we credit it with. Set that constant to 2000 and the baseline p99
reads 2000. **A metric whose value equals one of your own configuration
constants is not a measurement of anything.** The earlier p99 regression
(+446%) remains the honest characterisation of the routing cost, and it is
still visible here in p50.

The real cost of correctness is still tail latency: exploring unknown experts
and absorbing one degraded expert's 6× latency before the governor reacts. If
p99 matters more than correctness for a given workload, lower
`explorationRate` and tighten `degradedRatio` — but know which one you are
trading.

The two headline numbers:

- **`boaster`: claims 10000, earned 4530, true quality 0.35.** The baseline
  gave it 2000 of 2000 tasks. The harness gave it 49.
- **`rookie`: claims 0, earned 6817, true quality 0.95.** The baseline never
  called it once. The harness found it.

Kendall tau between learned rank and effective quality: **0.643** (0.619 in the
7-expert world; the two are not directly comparable, since the ranking problem
itself changed).

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
| 20260813 | 88.8% → 89.0% | 5 → 3 | 50.0 → 4.5 |
| 1 | 88.7% → 89.3% | 10 → 6 | 100.0 → 9.0 |
| 2 | 86.6% → 86.8% | 4 → 3 | 40.0 → 4.5 |
| 3 | 86.8% → 86.8% | 2 → 2 | 20.0 → 3.0 |
| 4 | 88.9% → 90.1% | 3 → 4 | 30.0 → 6.0 |

**Aggregate correctness moves +0.0 to +1.2 points, which is inside seed noise.**
On this workload the module does not measurably improve the answer rate, and
saying otherwise would be reporting a rounding error as a result. The reason is
worth stating because it is a compliment to the rest of the harness: the router,
the trust floor and the ledger already suppress `stalled` to about 0.2% of
traffic, so there is very little hang left for a timeout to catch.

What the ablation *does* establish:

- **Stall time falls 80–91%, every seed.** But the per-hang share of that is
  exactly `1 − 1500/10000 = 85%` — the ratio of the two constants, true by
  construction. Only the variation around 85% comes from hang counts.
- **Nothing regresses.** Correctness, unrecovered failures and p99 are flat or
  slightly better in all five seeds.
- **No leaked attempts.** The simulation prints `timeouts.inFlight()` at the
  end. With the policy on it is **0**; with `--no-timeout` it is **5** on seed
  20260813 — exactly the five hangs, still held open at the end of the run.
  That is the clearest single demonstration of what the module does: without
  it those attempts are never resolved by anything, and each one is a slot and
  a reputation the rest of the harness will never get back.

So the case for the module is not the aggregate numbers. It is that a hang is
invisible to every other layer — the breaker only learns from `recordFailure`,
the governor only samples on completion, the ledger only learns from outcomes —
and none of them fires on a call that simply never returns. The timeout
manufactures the one signal they all need. Its value is bounded below by
correctness (it does no harm) and is unbounded above in a world where a
*trusted* expert starts hanging, which this simulation does not model.

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
npm run sim:harness                # E2E numbers
npm run sim:harness -- --seed 7 --tasks 5000 --json
npm run sim:harness -- --no-timeout   # ablate the timeout policy
```

### Verified 2026-08-13

- `harness-routing` 45/45, `harness-consensus` 46/46, `harness-timeout` 29/29,
  `harness-transform` 31/31, `mcp-fleet` 35/35 — **186 assertions, 0 failures**.
- `npx tsc --noEmit` — 25 errors, unchanged from baseline, none in new code.
- `npx next build` — clean.
- Portability check — 11 files, no external imports.
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

## Not yet built

- **Sub-task routing granularity.** Routing is per task; the brief calls for
  sub-step and tool-call granularity. Now the highest-value remaining item.
- **A hang-under-trust scenario for the simulator.** `stalled` is demoted so
  fast that the timeout has almost nothing to catch, which is why the ablation
  above is within noise. The case the module is really for — a *high-earning*
  expert that starts hanging, where reputation keeps sending it work — is not
  modelled. Until it is, the module's upside is argued rather than measured.
- **Cancellation.** `TimeoutPolicy` reports expiry; it cannot cancel the
  underlying call, because it holds no handle on the transport. The caller must
  abandon the work itself, and nothing currently checks that it does.
- **Summarisation quality.** `transform.ts` accepts a `summarise` callback and
  charges its tokens, but supplies none — the dropped middle is simply gone
  unless a caller provides one. Nothing measures whether a summary preserves
  what the dropped turns contained, which is the part that would actually need
  an LLM and an eval.
- **Persistence.** Everything is in-memory behind interfaces (`FleetSource`,
  `CheckpointStore`). Postgres implementations are the obvious next step, and
  `circuit-breaker.ts` already mirrors the `circuit_breakers` table's columns.
- **Wiring to real RepID.** `agent_repid` already carries
  `earned_score`/`perceived_score`/`earned_weight`/`perceived_weight`; the
  ledger here should read and write those rather than holding its own map.
- **x402 / ERC-8004 binding, and ZK bind/unbind to humans.** Not started. The
  ledger is the substrate they attach to.
