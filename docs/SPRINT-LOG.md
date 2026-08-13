# Sprint log

Append-only. Newest at the bottom. Written by whoever did the work, including
the overnight routine — which has **no MCP tools**, so this file is its
changelog rather than `trinity_changelog`.

Each entry states what improved, what regressed, and what is still NOT CHECKED.
Three outcomes, never two: a thing was VERIFIED, NOT CHECKED, or FAILED.

---

## 2026-08-13 — full day

Five pieces of work. Every number below was produced by running something, not
by reading it.

### 1. PR #22 / #23 deploy verification — the observability gap closed

`/api/version` did not exist, so "did the merge land?" could only be inferred.
Built it, merged as `cfccb39`, and confirmed both surfaces serve the same SHA:
Vercel `iad1` in ~26s, Railway `us-east4-eqdc4a` in ~73s. That retroactively
settled #22, whose deployment I had (correctly at the time) marked NOT CHECKED
and argued was unobservable.

**Lesson.** The 502s that blocked verification were never Vercel — nine
attempts, all `zone: api.anthropic.com`, i.e. the MCP connector gateway. When a
tool fails, identify *which* hop failed before concluding anything about the
service behind it. Supabase `pg_net` is the standing route around a sandboxed
container:

```sql
select net.http_get(url := 'https://www.aitrinitysymphony.com/api/version',
                    timeout_milliseconds := 45000);
```

### 2. RLS phase 2 applied

Dropped `{anon} USING(true)` SELECT on `agent_kya_registry` and
`kya_compliance_receipts`; replaced with `{authenticated}`. Verified
behaviourally, not by reading the policy list: **anon sees 0 rows,
authenticated sees 12**. Both site roots stayed 200 at unchanged byte sizes;
the aggregate `system-trust` endpoint stayed public; `/agents` and `/receipts`
return 401. `trinity_changelog` #129 carries the rollback SQL.

**Lesson — the sharpest of the day.** My first changelog entry claimed this
"closes LESSONS S1 — no public table now has an anon `USING(true)` read
policy." **That was false**, and I caught it only because I ran a DB-wide audit
immediately after. **137 other tables** still carry an unrestricted anon SELECT,
and **three are anon-WRITABLE** with `cmd=ALL, qual=true`: `sprint_updates`,
`trinity_research_log`, `trinity_retros`. S1 named two tables; those two are
fixed. The *class* is wide open. Amended #129 in place before it hardened into
context. **Writing the summary is where the overclaim enters — audit the claim,
not just the change.**

### 3. Fleet discovery over MCP — `POST /api/mcp/fleet`

Ported the discovery half of kyegomez/swarms' AOP over `agent_node_registry`.
Hand-rolled JSON-RPC, no new dependencies. 35 assertions plus 12 transport
checks over real HTTP.

Liveness is tri-state: `is_live` is `true` or `null`, **never `false`**,
mirroring `v_fleet_truth`. Note `v_node_truth` does *not* do this — its
`is_live` is a plain `heartbeat_at > now() - 10min`, which reports `false` for a
node nobody has asked about. Still unreconciled.

**Lesson.** `agent_node_registry` has zero rows and no producer. A discovery
server over it would have been decorative, so the write path shipped with it.
Shipping a careful-looking surface over an empty table is the same defect as the
thing I was porting away from.

### 4. Three external repos read closely

**kyegomez/swarms** — excellent topologies, no epistemics. Three defects
verified by execution:

- `Task.correct_answer` threaded through ~20 call sites *including the
  advertised MCP tool schema*, compared to nothing. The only
  `if correct_answer:` is a debug log reading "Using correct answer for
  validation".
- `agent_judge.get_reward()` scores by substring over the whole conversation.
  Ran it: `"This is NOT correct."` → 1. `"accurate, well-sourced and
  verifiable"` → 0.
- Repo-wide search for `track_record|performance_history|calibration` returns
  one file, and it is a prompt. Self-reported bid confidence is never
  reconciled against outcomes.

**LangGraph** — took the `TimeoutPolicy` run-vs-idle split (still unbuilt, and
the highest-value remaining item), `_replay.py`'s rewind-to-before-the-failure
plus first-visit semantics, and the control-flow-vs-failure error taxonomy.

**crewAI examples** — took the bounded retry that ends in a **named terminal
branch** rather than an exception. An exception gets caught somewhere generic
and attributed to the wrong component.

### 5. The portable trust harness

Nine dependency-free modules in `lib/trustshell/harness/`, portability enforced
by a check script. **126 assertions across three suites, 0 failures.** Full
detail in `docs/TRUST-HARNESS.md`.

E2E sim vs a greedy self-claimed-score baseline: correctness **48.3% → 88.8%**,
unrecovered failures **9 → 0**, load Gini **0.800 → 0.646**. Stable across five
seeds. Honest cost: **p99 latency 141ms → 770ms**, because the baseline is fast
by being confidently wrong.

**Lesson — three build-measure-learn cycles, and two of the three defects were
in the measurement, not the code.**

- tau 0.429: a raw EWMA carries no evidence weight, so 118 observations
  outranked 757. Fixed with shrinkage.
- tau 0.333: **the fix introduced a cold-start cliff.** A fixed
  observation-count gate let experts leave exploration while still shrunk too
  hard to compete — four of seven pinned at exactly 15 observations forever,
  and the best expert in the pool fell from 841 calls to 15. *This is the exact
  failure mode the brief named, reintroduced by the fix for a different one.*
- tau 0.619: **the metric was wrong.** It ranked against nominal quality, so
  the harness was scored DOWN for correctly detecting a silent degradation.

**Suspect the measurement before the code**, and after fixing one failure mode,
check whether you have reintroduced another.

### 6. Repo-level: `tsconfig.json` had no `target`

So tsc downlevelled to ES5, which silently broke `instanceof` on `Error`
subclasses and blocked `Map` iteration. It bit twice in one day — bad MCP tool
input was being reported as an internal server error. Added `"target":
"es2022"`; error count stayed at exactly 25 and the build stayed clean.

**Also corrected** `app/api/CLAUDE.md`, which claimed a ~37-error tsc baseline.
It is **25**. A stale baseline turns a regression into a rounding error.

### 7. Sprint C — the run/idle timeout split (overnight routine, firing 1)

Backlog item 1, the highest-value remaining item per `TRUST-HARNESS.md`. Built
`lib/trustshell/harness/timeout.ts` plus `scripts/harness-timeout-test.mjs`.

**The gap it closes.** A hang is invisible to every other layer, and this is
structural rather than an oversight: `CircuitBreakerRegistry` only learns from
`recordFailure`, `CapacityGovernor.observe` is only called on completion, and
`ReputationLedger` only learns from outcomes. A call that never returns
produces none of those, so a hanging expert keeps full slots, a closed breaker
and an untouched reputation — forever. The timeout manufactures the one signal
the other three already know how to consume, which is why **no existing module
needed to change**. That was a deliberate choice: modifying `capacity.ts` or
`router.ts` risked 91 passing assertions for no gain.

**VERIFIED — mechanism.** 29 assertions, 0 failures. 155 across all four
suites. `tsc --noEmit` **25**, unchanged. `next build` clean. Portability 10
files.

**VERIFIED — the tests are actually evidence.** Three mutations applied to
`timeout.ts`, all caught: refreshing `startedAt` from a heartbeat failed 3
assertions, removing the idle deadline failed 12, not deleting swept attempts
failed 5. The first is the one that mattered — it collapses two deadlines into
one *while still presenting an API with two*, and it is caught by the single
test written for it. A suite that still passes with the feature deleted is not
evidence; this was checked rather than asserted.

**MEASURED — and smaller than it first looked.** Adding a `stalled` expert
(claims 9000, hangs half its calls after the midpoint, never errors) moved the
headline from +83.7% to +112.7%. That number is **not** an improvement and is
not reported as one: the harness went 88.8% → 89.0%, i.e. flat, while the
baseline fell 48.3% → 41.9% because a hanging expert eats its retry slot. The
delta grew because the world got harder for the baseline specifically.

The honest test is the ablation — same harness, same seeds, `--no-timeout`:

| seed | correctness off → on | hangs off → on | stall seconds off → on |
|---|---|---|---|
| 20260813 | 88.8% → 89.0% | 5 → 3 | 50.0 → 4.5 |
| 1 | 88.7% → 89.3% | 10 → 6 | 100.0 → 9.0 |
| 2 | 86.6% → 86.8% | 4 → 3 | 40.0 → 4.5 |
| 3 | 86.8% → 86.8% | 2 → 2 | 20.0 → 3.0 |
| 4 | 88.9% → 90.1% | 3 → 4 | 30.0 → 6.0 |

**Aggregate correctness gain is +0.0 to +1.2 points — inside seed noise.** On
this workload the module does not measurably improve the answer rate. Stall
time falls 80–91% on every seed, but the per-hang share of that is exactly
`1 − 1500/10000 = 85%`, true by construction from the two constants. Nothing
regressed on any seed.

The crispest single result is the leak count. The simulation prints
`timeouts.inFlight()` at the end of the run: **0** with the policy on, **5**
with `--no-timeout` on seed 20260813 — exactly the five hangs, still held open
when the run ends. Without the module nothing ever resolves them, and each is a
capacity slot and a reputation observation the harness never gets back. That is
a categorical difference rather than a percentage, which is why it survives the
scrutiny the aggregate numbers did not.

**REGRESSION NOT CLAIMED AS A WIN.** p95/p99 flipped from +446% (harness worse)
to −92% (harness better). This is an artefact, not a speed-up. The harness's
own p99 went 770 → 794 ms — slightly *worse*. The baseline's tail collapsed
onto `RUN_TIMEOUT_MS` because hangs are 5.2% of its calls, so its p99 is
literally a constant I chose; set it to 2000 and the baseline reads 2000. **A
metric whose value equals one of your own configuration constants measures
nothing.** The +446% p99 regression remains the honest characterisation of what
correctness costs, and it is still visible in p50 (+10.4%).

**The measurement trap this firing hit.** The first version of the ablation did
not exist — the plan was to compare the new harness against the old baseline
numbers. That would have credited the timeout module with a 112.7% delta it did
not produce. Two of the three defects earlier today were measurement defects
rather than logic defects; this was a third, caught before it was written down.
Relatedly, `effectiveQuality()` had to learn about `hangsAt` in the same commit:
without it the Kendall tau would have ranked the harness against quality
`stalled` never delivered, scoring it **down** for correctly demoting a
staller — the identical wrong-metric shape that produced the spurious tau 0.333.

**NOT CHECKED.** The scenario the module actually exists for — a *high-earning*
expert that starts hanging, where reputation keeps sending it work — is not
modelled. `stalled` is demoted so fast there is almost nothing left to catch,
which is precisely why the ablation is within noise. Until that scenario exists
the module's upside is argued, not measured. Also: `TimeoutPolicy` reports
expiry but cannot cancel the underlying call, and nothing verifies the caller
abandons it. Logged as the top two items under "Not yet built".

### 8. Sprint D — middle-out context compression (overnight routine, firing 2)

Built `lib/trustshell/harness/transform.ts` plus
`scripts/harness-transform-test.mjs`. **31 assertions, 0 failures; 186 across
five suites. tsc 25, unchanged. next build clean. Portability 11 files.**

**Backlog order deviated from, deliberately.** The authoritative list in
`TRUST-HARNESS.md` had *sub-task routing granularity* as the top item. Routing
per tool-call rather than per task reshapes the task model and `router.ts`,
which trips the standing stop condition — architecturally significant, leave it
for Sean. Took context-bloat control instead, which is additive and touches
nothing existing. Following the stop protocol is not the same as skipping work.

**What the module is actually for.** Dropping context is easy; dropping it
*silently* is the silent-degradation failure in different clothes — answers get
worse, the operator sees a smaller prompt and a green metric, and nothing says
half the conversation was discarded. Every result carries what went in, what
came out, which ids were dropped, and why.

**MEASURED — context bloat, on its own model** (400 turns, 4000-token budget,
pinned system prompt, tool pair every third turn; the routing arms are untouched
and their numbers are byte-identical to 20d702f):

| metric | untransformed | transformed | delta |
|---|---|---|---|
| peak context | 94,344 tokens | 4,000 tokens | −95.8% |
| mean context | 48,705 tokens | 3,888 tokens | −92.0% |

Mean compression ratio 0.159. Final turn retains 36 of 935 messages. Peak lands
exactly on the budget, so the budget binds rather than aspires.

**The integrity counters matter more than the compression.** Across all 400
turns: **pairs split 0, pinned lost 0, turns over budget 0.** These are not
tunable tradeoffs — a tool call separated from its result, or a discarded system
prompt, makes the compression ratio look *better* while corrupting the
conversation. Counted every turn, not asserted once.

**A defect the tests found in the module, not the other way round.** The
over-budget explanation named the floor as "pinned + head + tail" while omitting
messages held by pair integrity — sending an operator to raise a limit that was
never the binding constraint. Fixed so the basis names the full floor.

**The wrong metric, third instance today — this time in my own reporting.** The
first version of the measurement printed "messages dropped across the run:
173800" for a conversation containing 935 messages, because each turn
re-transforms everything and I summed per-turn drops. A large impressive number
measuring nothing. Replaced with the final-turn retained/total.

**MUTATION TESTED — and this is the part worth reading.** Six mutations. Five
were caught immediately: droppable pinned content (3 failures), pair-integrity
guard neutered (1), pairs ungrouped so a call splits from its result (2),
summary tokens uncharged (1), ratio on message count (1), `withinBudget`
hardcoded true (3), head protection removed (6).

The sixth **exposed a genuine hole**. Pinned messages are guarded twice — kept
out of the droppable set *and* put in the protected set — so removing the second
guard alone passed all 30 assertions and looked like an equivalent mutant. It is
not equivalent: the protected set also seeds pair protection, so a **pinned tool
call would silently lose its result**. Added a 31st assertion; the mutation now
fails. Writing more tests from the same mental model would never have found it —
only deleting the code and watching what stayed green did.

Two earlier mutation attempts were themselves invalid and had to be redone: one
failed to compile (so its empty output briefly looked like a pass), and one
removed only half the guard. **A mutation that does not compile is not evidence
of anything**, and neither is one that leaves the mechanism intact.

**NOT CHECKED.** No summariser is supplied — the module accepts one and charges
its tokens, but the dropped middle is simply gone unless a caller provides one,
and nothing measures whether a summary preserves what the dropped turns
contained. That is the part needing an LLM and an eval. The 4-chars-per-token
default estimator is crude by design; a caller with a real tokenizer should
inject one. And the compression model is synthetic — message sizes come from a
seeded RNG, not from real traffic.

### 9. Parameter A/B sweep — and one result that did not survive scrutiny

Built `scripts/harness-experiment.mjs`. Sweeps harness parameters across TRAIN
seeds, re-measures the winners on HOLDOUT seeds that took no part in the choice,
and then re-runs them in a counterfactual world. It opens with a validity guard:
the experiment arm is a copy of `runHarness()`, so it first asserts it reproduces
the published 89.0% / p99 794 / tau 0.643 and aborts if it has drifted.

**Seed noise is 3.4pp across ten seeds, so anything under ~1.7pp is nothing.**

**Round 1 — three arms beat control on train AND holdout:**

| arm | train Δpp | holdout Δpp |
|---|---|---|
| confidenceK 20 | +3.59 | +3.09 |
| explorationRate 0.40 | +2.31 | +2.55 |
| explorationRate 0.25 | +1.92 | +1.89 |

Replicating on held-out seeds rules out seed-fitting. It does **not** rule out
scenario-fitting, and that is what the next round was for.

**Round 2(c) — the decisive test.** Every round-1 winner works by reacting to an
unknown expert sooner, and this world contains `rookie`: true quality 0.95,
claims 0, planted precisely to reward that. Rewarding exploration in a world
built to reward exploration is close to circular. Re-ran with the gem removed —
same unknown expert, mediocre quality 0.50:

| arm | Δpp with gem | Δpp NO gem | tau (no gem) |
|---|---|---|---|
| explorationRate 0.25 | +1.89 | **+0.02** | 0.557 |
| explorationRate 0.40 | +2.55 | **+0.22** | 0.679 |
| confidenceK 20 | +3.09 | **+1.86** | 0.800 |
| cK20 + expl 0.40 | +3.73 | +1.30 | 0.729 |

**The exploration result evaporates.** Both arms fall to inside noise once the
planted gem is gone. Raising `explorationRate` is not an improvement; it is a
property of the scenario, and shipping it as a default would have been tuning to
a world I wrote. It replicated across ten seeds and was still wrong — *holdout
seeds catch noise-fitting, not scenario-fitting, and only a counterfactual world
catches the second.*

**`confidenceK` survives**, and the mechanism is different from what round 1
suggested: in the no-gem world `confidenceK 20` gives rookie FEWER calls than
control (21 vs 46). It is not exploring more — it is reacting to evidence faster,
including correctly demoting a mediocre unknown. That generalises to any fleet
with degrading or failing experts, which is every fleet.

**Correctness and ranking quality diverge, and picking on correctness alone
picks wrong.** In the no-gem world: cK10 +2.33pp with tau 0.714; cK15 +2.10pp
with tau 0.743; cK20 +1.86pp with tau **0.800**. Lower K buys correctness by
shrinking less — which is the road back to the original tau 0.429 defect, where
118 observations outranked 757. The optimum on the headline metric is the worst
on the ranking metric. Fourth instance today of the measurement being the trap.

**`trustFloor` is inert at its default.** Identical results at 0, 2000, 3500,
5000; a slight change at 6500; and at 8000 correctness collapses to 74.5%. The
knob is wired, but earned scores never approach the default 2000, so it does
nothing until it suddenly does a great deal. Worth knowing before anyone tunes it.

**RECOMMENDED, NOT APPLIED: `confidenceK` 50 => 20.** In the honest world that is
+1.86pp correctness, tau 0.693 => 0.800, p99 811 => 202. Three metrics improve
together and it survives both holdout and the counterfactual. It is left as a
recommendation because it changes a shipped default for every consumer of the
ledger on **simulator evidence alone**, and the standing NOT CHECKED is that
nothing here has been validated against live traffic. What would justify making
it: one replay against real `agent_repid` outcomes.

**NOT CHECKED.** Only one counterfactual world was tried (gem removed). Not
tested: a fleet with no degrading expert, a much larger fleet, or task volumes
where each expert sees far fewer than 250 observations — the regime where low
`confidenceK` should be most dangerous and where this sweep says least.


### 10. Sprint E — the hang-under-trust scenario, and two scenarios that lied

Backlog item 3 was Postgres persistence. **Skipped deliberately**: this session
has no Supabase, so `agent_repid`'s real schema cannot be inspected, and writing
SQL against a table I cannot see is the exact "success it has not earned"
pattern this repo exists to avoid. Took the next authoritative item instead —
the hang-under-trust scenario — which is fully verifiable here and closes a NOT
CHECKED I logged myself in Sprint C.

**186 assertions unchanged, tsc 25, portability 11 files, and the simulator's
published headline is byte-identical** — this work lives in
`scripts/harness-experiment.mjs` (`npm run experiment`) and touches no module.

**THE SCENARIO LIED TWICE BEFORE IT TOLD THE TRUTH.**

*Attempt one*: `veteran`, quality 0.93, hangs from 60% onward. It printed a
clean table showing the timeout barely mattered. The table was meaningless —
diagnosis showed veteran took **4 calls all run and 0 before it went bad**. It
was `stalled` wearing a different name: a cold expert that hangs, which is the
easy case the scenario was written to escape. Had I reported that table it would
have read as "the timeout does not help under trust", a false negative dressed
as a finding.

*Attempt two*: made veteran the best expert in the pool on every axis. It took
**1 call** before going bad. That failure exposed something worth more than the
scenario: **with default parameters a cold expert takes almost no early traffic
at all** — `rookie` also took 0 calls in the first 60% of a run. Exploration is
nominally 12% but the incumbent absorbs it. No newcomer can build trust inside a
run, which is the cold-start problem still present in a milder form, and it
corroborates the A/B sweep independently (confidenceK 50→20 moves rookie from
105 calls to 752).

*Attempt three*: warm-start the ledger with 400 good observations. A veteran does
not earn its reputation inside the window you observe it in — it arrives holding
one. Valid at last: **1010 calls before going bad, confidence 0.97 on 1636
observations.**

**The scenario now carries its own validity guard** — ≥200 pre-hang calls and
≥0.80 confidence, or it refuses to print an ablation at all. A scenario that
cannot prove it instantiated its own premise must not be allowed to report
numbers, because a confident table from a broken scenario is worse than no table.

**MEASURED — 10 seeds, timeout off vs on:**

| metric | OFF | ON | delta |
|---|---|---|---|
| calls to veteran once bad | 446 | **6** | −98.7% |
| hangs encountered | 220 | 3 | −98.5% |
| wall clock lost to hangs | 2,195 s | 4.8 s | −99.8% |
| p99 latency | 10,000 ms | 713 ms | −92.9% |
| Kendall tau | 0.436 | **0.579** | +32.8% |
| unrecovered failures | 2 | 0 | −94% |
| correctness rate | 92.4% | 91.8% | **−0.61pp** |

**REGRESSION, STATED PLAINLY: correctness does not improve and nominally falls
0.61pp.** That is inside the 2.6pp seed spread so it is not a real regression
either — but the honest claim is that **the timeout buys nothing in correctness
here**, and I am not claiming otherwise. Without it a hang still costs the task
nothing: the outer run deadline abandons the attempt and the retry usually
succeeds. Correctness is preserved at ruinous cost, which is why correctness is
the wrong metric for this module.

**The tau row is the real finding.** Without the timeout the reputation ledger is
**silently poisoned** — the veteran keeps a high earned score forever while
delivering nothing, because a hang produces no outcome to learn from. Ranking
quality collapses 0.579 → 0.436. A hang is not merely wasted latency; it is a
lie the ledger cannot detect, and the ledger is what the entire harness rests on.
That is a stronger argument for the module than anything in Sprint C, and unlike
Sprint C it is measured rather than argued.

**NOT CHECKED.** Still no live-LLM validation; the veteran's behaviour is a model.
The warm start is a modelling choice — 400 good observations — and a different
figure would move how fast the ledger reacts. Only one hang rate (50%) and one
onset (75%) were tried. And the correctness result may be an artefact of a
generous retry budget: with 3 attempts a hang is nearly free, so a fleet with no
retries would likely show the timeout buying correctness too. Untested.


### 11. APPLIED: `confidenceK` 50 → 20 (authorised by Sean)

Recommended in entry 9 and left unapplied there because it changes a shipped
default on simulator evidence alone. Authorised, so applied — and applying it
meant re-measuring everything downstream, not flipping a constant.

Changed in three places, because two of them would otherwise have silently
disagreed with the shipped default: `reputation.ts` DEFAULTS, the explicit value
`harness-simulate.mjs` passes, and the control in `harness-experiment.mjs` (a
sweep whose control is not the shipped default measures deltas against a config
nobody runs).

**VERIFIED.** 186 assertions, 0 failures — nothing in the suites depended on the
old value. tsc **25**, unchanged. `next build` clean. Portability 11 files.

**MEASURED — seed 20260813, before → after:**

| metric | cK 50 | cK 20 |
|---|---|---|
| correctness rate | 89.0% | **92.3%** |
| p99 latency | 794 ms | **179 ms** |
| p50 latency | 127 ms | 115 ms |
| max single-expert share | 66.0% | 47.5% |
| calls to the degraded expert | 50 | **0** |
| calls to the crashed expert | 3 | **0** |
| rookie calls | 43 | **737** |
| Kendall tau | 0.643 | **0.643** |

**The tau row is the honest one.** Correctness rose 3.3 points and ranking
quality did not move at all on this seed. The +0.107 tau the sweep reported was
a ten-seed mean in the counterfactual world; a single seed shows none of it.
Reporting "correctness AND ranking improved" from the sweep alone would have
been true on average and false here. Both are tracked precisely because they
come apart.

**A claim in this document was too pessimistic and is now corrected.** Two
entries argued that correctness is bought with tail latency, quoting +446% p99
(141 → 770 ms). Against the same 141 ms reference the harness now sits at 179 ms,
**+27%** — about a sixth of the claimed cost. The rest was `confidenceK` 50
reacting too slowly to `decayer`, so 50 calls per run landed on a 6×-latency
expert; at 20 that is 0. The regression was real when measured. It was not
intrinsic, and calling it the standing price of correctness overstated it.

**A guard that had itself drifted.** `harness-experiment.mjs` opens by asserting
it reproduces the simulator's published numbers. The assertion used the
`PUBLISHED` constant but the printed message repeated those numbers as string
literals, so the moment `PUBLISHED` was updated it printed
`correctness 92.3% (published 89.0%) ... => MATCH` — a drift guard reporting a
mismatch and the word MATCH in the same line. Now interpolated from `PUBLISHED`.
**An anti-drift check is not exempt from drifting.**

**Mirror-image confirmation.** With the control now at cK20, the sweep arm
`confidenceK 50 (old default)` reads **−3.59pp** — the same magnitude the
original sweep reported in the opposite direction, which is what internal
consistency looks like. The `explorationRate` arms, meanwhile, have collapsed to
+0.28/+0.01pp ("FITTED TO TRAIN NOISE") and −0.38/−0.56pp in the no-gem world,
independently reconfirming that the exploration result was an artefact of the
planted gem. Good thing it was never applied.

**Also updated:** the timeout ablation table and the hang-under-trust table were
both re-run at the new default. The timeout's measured contribution SHRANK —
hang-under-trust tau was 0.579 vs 0.436 and is now 0.657 vs 0.629. A ledger that
reacts faster to the evidence it does get is less damaged by the evidence it
never gets. **The earlier +32.8% overstated the module because it was measured
against a badly-tuned control**, which is a general hazard: an ablation's result
depends on how good the arm around it is.

**NOT CHECKED.** Still simulator evidence only; no live-LLM or `agent_repid`
replay. The sweep says least about fleets where each expert sees far fewer than
~250 observations, which is exactly where a low K is most dangerous, and that
regime is untested. Whether a newcomer added mid-run can now earn trust is also
untested — the hang-under-trust scenario still warm-starts its veteran, and that
warm start was not retested against the new default.


### 12. Sprint F — Postgres persistence for the ledger, and a table that cannot hold it

Backlog item 3, attempted properly this time: Supabase was reachable, so
`agent_repid` could be inspected rather than guessed at. Last firing I skipped
this item precisely because writing SQL against an uninspectable table is the
failure mode this repo exists to avoid — that judgement was right, and the
inspection is why.

**208 assertions (up from 186), 0 failures. tsc 25 unchanged. next build clean.
Portability still 11 files** — the adapter lives outside the harness, which is
the whole point.

**VERIFIED BY QUERY, not assumed.** `agent_repid` PK is `agent_name`;
`earned_score` is an integer whose live range across 87 rows is **0..10000, the
same basis-point scale the harness uses** — no conversion, and worth checking,
because a silent 10× scale mismatch would corrupt every ranking downstream. RLS
is on: `service_role` ALL, `authenticated` SELECT only, so writes need the admin
client.

**THE FINDING: the table cannot hold a ledger.** There is no observation-count
column. Confidence is `n / (n + k)`, so a ledger restored without `n` comes back
with confidence 0 and **every earned score collapses to the prior** — a fleet
with years of history reloading as though it had never run a task. The load
succeeds, every row is present, and every ranking is quietly wrong.

There is no honest workaround. `total_challenges_made` and `total_trades` count
different things, and borrowing one would make confidence a function of
unrelated activity — the earned/perceived defect reintroduced through the
schema. Defaulting `n` to 0 *is* the erasure.

So the store **refuses to load or save** until the column exists, throwing a
named `MissingObservationsColumnError` that names the migration. Confirmed
against the live database that the column is absent, so that refusal is the
actual current behaviour rather than a hypothetical branch.

**Migration written, NOT applied**, as the standing rule requires:
`supabase/migrations/20260813210000_agent_repid_earned_observations.sql`.
Additive only — one nullable integer plus a non-negative check constraint, no
existing column touched, no policy change, rollback in the header. No backfill
and no default, both deliberately: there is no honest source for a historical
count, and a default of 0 would assert "measured zero times" for rows the ledger
has simply never seen.

**THE LEDGER HAD NO TESTS.** `reputation.ts` is the module the entire thesis
rests on and it had **zero direct assertions** — five suites, 186 assertions,
none touching it. It was exercised only through a simulation whose numbers it
produces. Now 22, including the ones that pin the behaviours the design
arguments depend on: an unobserved expert sits on the prior and says it asserts
nothing; no evidence is not evidence of badness; a long record outranks a lucky
streak; cold start keyed to confidence rather than a count.

**The load-bearing test is the argument for the migration, executable.**
`dropping observations erases the fleet`: a veteran on 800 observations earns
>8500, and restoring it with `observations: 0` returns exactly 5000. A companion
test asserts that this **raises no error at all** — which is the entire reason
the store must refuse up front.

**Two of my own tests were wrong, and one taught me something.** The
track-record test appended 60 failures after 400 successes and expected a good
score; it got 442. The observed score is an EWMA with `alpha` 0.06, so its
effective window is ~17 outcomes — **it is not a lifetime average**, and a
sustained recent collapse floors an expert regardless of history. That is
intended (it is how `decayer` is caught) but I had been reasoning about it as an
average. Fixed by interleaving, and the property now has its own test. The
second was plain arithmetic: I expected the UCB bonus below 30 at n=502 when
`(1 − 502/522) × 2500` is 96.

**NOT CHECKED.** The store has never executed against Postgres — it cannot,
until the migration is applied, and that is Sean's call. Its row mapping, upsert
conflict handling and error classification are therefore unverified in the only
way that counts. `MissingObservationsColumnError` is triggered by PostgREST code
42703 or the column name appearing in the message; the code path is not
exercised by a live failure. `FleetSource` and `CheckpointStore` still have no
Postgres implementation.


### 12. Sprint G — the MoA panel: a negative result that inverted on re-scoring

Wired `QuorumEvaluator` into routing as an opt-in panel mode in
`harness-experiment.mjs` (`npm run experiment`, section e). It had been imported
by `harness-simulate.mjs:42` and **never called** — 46 assertions of PBFT
aggregation, loaded and unused. Default paths untouched, so the validity guard
still reproduces the simulator exactly and every published number stands.

**208 assertions unchanged, tsc 25, no module edited.**

**FAILED — the panel lost badly.** Ten seeds, versus top-1 at 91.8%:

| panel | via quorum gate | Δpp | calls/task | p99 |
|---|---|---|---|---|
| 2 | 77.9% | **−13.83** | 2.00 | 213 ms |
| 3 | 84.5% | −7.31 | 3.00 | 632 ms |
| 4 | 80.3% | −11.49 | 3.98 | 959 ms |

**Then the diagnosis, which mattered far more than the number.** Per 2000 tasks
the panel produced ~16 REJECT rounds and **~424 INDETERMINATE**. It almost never
agrees on a wrong answer — it just fails to clear the 2/3 supermajority, and a
gate that abstains was being scored as wrong. What I had measured was a
fail-closed unanimity gate, not aggregation.

Re-scoring the **identical votes** under plurality semantics — what an MoA
aggregator actually does — inverts the result completely:

| panel | gate | plurality | Δ vs top-1 |
|---|---|---|---|
| 2 | 77.9% | **95.4%** | +3.62 |
| 3 | 84.5% | **96.8%** | +5.00 |
| 4 | 80.3% | **98.3%** | +6.52 |

**The entire difference between "aggregation is a disaster" and "aggregation is
worth +6.5pp" is which lens is applied to one set of votes.** Fifth instance of
this pattern today and the most expensive had it gone unexamined: the first
table alone would have justified deleting `quorum.ts` as useless.

**A claim I made this morning was wrong and is corrected.** The roadmap
(`09a4795`, ~6 hours ago) asserted "`router.ts` + `quorum.ts` already *is*
RouteMoA in structure … the gap is one wiring change, not a rewrite." It is not.
`QuorumEvaluator` is a fail-closed BFT commit gate; an aggregator answers a
different question. *Quorum:* should we COMMIT? *Aggregator:* which answer do we
RETURN? The wiring change was made and measured, and it refuted the claim.

`quorum.ts` is not defective — it is correct as a commit gate, and its guard
rejecting `supermajority: 0.5` ("must be in (0.5, 1)") is right. The panel bent
to the guard rather than the reverse.

**COST, not netted out of the gain:** calls/task 1.02 → 2.00/3.00/3.98 and p99
193 → 213/632/959 ms. MoA buys correctness with calls and tail latency, exactly
as the literature says. Any future default must bound this — screen cheaply,
escalate to a panel only when the prior is uncertain.

**NOT CHECKED.** The panel model is deliberately conservative: a wrong answer
votes `reject`, so wrong answers count as one agreeing bloc, when in reality
there are many ways to be wrong and one way to be right. Incorrect answers
scatter, so a real aggregator should do BETTER than +3.6 to +6.5pp — that range
is a floor, not a ceiling, and it is untested. No aggregator module exists yet;
the plurality column is a second scoring lens on recorded votes, not a shipped
code path. And this is still the simulator: none of it is validated against the
152,001 real labelled outcomes now known to be reachable.

**Next item, and it is now clearly justified rather than assumed:** a small
dependency-free weighted-plurality aggregator beside `quorum.ts`, returning the
plurality answer with an explicit abstain policy instead of failing closed, with
votes weighted by earned reputation — the thing MoA does not do, since it
aggregates uniformly or by a learned gate and has no notion of a proposer that
lies.


---

### Standing NOT CHECKED

- No live-LLM validation of the harness. Every magnitude comes from the
  modelled world in `harness-simulate.mjs`. Mechanisms verified; numbers only
  as good as the model.
- `agent_node_registry` still empty, so the MCP read tools serve `NOT_CHECKED`.
- `/api/mcp/fleet` not yet observed on a deployed surface — needs PR #24 merged.

### Open, Sean-gated

- TRUSTSHELL-V1 §12 Q1 (receipt storage) and Q2 (signing key custody). These
  block M2, which is what makes memory EARN — `memory_outcome_link` exists but
  nothing writes to it.
- `repid_permissions` ladder migration `20260813020000`.
- `repid_config` readable by anon while holding `enterprise_api_key`.
- `ground_truth_facts` is production config — a row changes live HAL scoring.

### Follow-ups worth their own PR

1. **Three anon-writable tables** (`sprint_updates`, `trinity_research_log`,
   `trinity_retros`) — `cmd=ALL, qual=true`. Sharpest remaining security item.
2. 137 tables with unrestricted anon SELECT.
3. `hal_quorum_receipts` / `hal_quorum_validator_votes` do not exist though a
   writer targets them; `hal_evaluations` logged a 403-blocked score-event as
   `decision=APPROVE hal_score=0`.
4. `hal_canary_cases`: 18 cases, 0 internal.
5. Reconcile `v_node_truth.is_live` with the tri-state rule.
