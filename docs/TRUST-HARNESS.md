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

## Measured results

`npm run sim:harness` — 2000 tasks, 7 experts, virtual clock, deterministic.
Both arms see an identical seeded workload; only the routing and
fault-tolerance layers differ. The baseline is modelled on what the surveyed
frameworks actually do: greedy top-1 on a self-declared score.

Seed 20260813:

| metric | baseline | harness | delta |
|---|---|---|---|
| correctness rate | 48.3% | **88.8%** | +83.7% |
| completion rate | 99.6% | 100.0% | +0.5% |
| unrecovered failures | 9 | **0** | −100% |
| calls per task | 1.25 | 1.03 | −17.4% |
| load Gini (0 = even) | 0.800 | 0.646 | −19.2% |
| max single-expert share | 80.0% | 63.4% | −20.8% |
| p50 latency | 111 ms | 127 ms | +14.4% |
| p95 latency | 132 ms | 180 ms | +36.4% |
| p99 latency | 141 ms | **770 ms** | +446% |

Across five seeds (1, 7, 20260813, 99991, 424242) the harness scores
87.5–89.4% against a baseline of 47.9–49.5%. The effect is not seed luck.

**The p99 regression is real and is the honest cost.** The baseline is faster
because it is confidently wrong: it sends 100% of traffic to `boaster`, which
claims 10000, has true quality 0.35, and is the *fastest* expert in the pool.
Buying correctness means spending tail latency on exploring unknown experts and
on absorbing one degraded expert's 6× latency before the governor reacts. If
p99 matters more than correctness for a given workload, lower
`explorationRate` and tighten `degradedRatio` — but know which one you are
trading.

The two headline numbers:

- **`boaster`: claims 10000, earned 4530, true quality 0.35.** The baseline
  gave it 2000 of 2000 tasks. The harness gave it 49.
- **`rookie`: claims 0, earned 7261, true quality 0.95.** The baseline never
  called it once. The harness found it.

Kendall tau between learned rank and effective quality: **0.619**.

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
npm run sim:harness                # E2E numbers
npm run sim:harness -- --seed 7 --tasks 5000 --json
```

### Verified 2026-08-13

- `harness-routing` 45/45, `harness-consensus` 46/46, `mcp-fleet` 35/35 — **126
  assertions, 0 failures**.
- `npx tsc --noEmit` — 25 errors, unchanged from baseline, none in new code.
- `npx next build` — clean.
- Portability check — 9 files, no external imports.
- Simulation across 5 seeds, results above.

**NOT CHECKED:** anything against live LLM experts. Every number here is from
the simulated world in `harness-simulate.mjs`, whose expert behaviour is a
model, not a measurement. The mechanisms are verified; the *magnitudes* are
only as good as that model.

## Not yet built

- **`TimeoutPolicy`** — the run/idle split from LangGraph is documented above
  and not yet implemented. It is the highest-value remaining item, because idle
  timeout is the only mechanism here that would catch an expert that hangs
  without erroring.
- **Sub-task routing granularity.** Routing is per task; the brief calls for
  sub-step and tool-call granularity.
- **Context-bloat control.** No message-transform layer yet; LangGraph's
  middle-out compression with a reported compression ratio is the model.
- **Persistence.** Everything is in-memory behind interfaces (`FleetSource`,
  `CheckpointStore`). Postgres implementations are the obvious next step, and
  `circuit-breaker.ts` already mirrors the `circuit_breakers` table's columns.
- **Wiring to real RepID.** `agent_repid` already carries
  `earned_score`/`perceived_score`/`earned_weight`/`perceived_weight`; the
  ledger here should read and write those rather than holding its own map.
- **x402 / ERC-8004 binding, and ZK bind/unbind to humans.** Not started. The
  ledger is the substrate they attach to.
