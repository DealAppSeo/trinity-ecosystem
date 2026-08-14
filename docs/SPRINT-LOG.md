# Sprint log

Append-only. Newest at the bottom. Written by whoever did the work, including
the overnight routine — which has **no MCP tools**, so this file is its
changelog rather than `trinity_changelog`.

Each entry states what improved, what regressed, and what is still NOT CHECKED.
Three outcomes, never two: a thing was VERIFIED, NOT CHECKED, or FAILED.

---

# STATUS: THE OVERNIGHT SPRINT ROUTINE IS STOPPED

**If you are the sprint routine: do not start a backlog item. Verify ground
truth, confirm this block, end the turn.** The `STOPPED` marker further down
(and Sprint W at the end) are the full record; this header exists because they
were buried mid-file and a firing could miss them.

Stopped 2026-08-14. Both documented stop conditions held, independently:

- **Backlog exhausted.** (1) run/idle timeout split — built, Sprint C, plus
  abandonment accounting in K. (2) context-bloat transform — built, Sprint D.
  (3) Postgres reputation persistence — built, blocked only on an unapplied
  migration. (4) sub-task routing granularity — **architecturally significant,
  deferred to Sean**, which is itself a stop condition. (5) `hal_quorum_*`
  migration — **declined deliberately**: grepped the repo, no writer targets
  those tables here, so the schema would have been invented.
- **Two consecutive firings with no measurable improvement** (Sprints J and K).

Work continued past that point only under explicit user direction, producing
Sprints L–W. Both axes are now closed:

- **Simulator axis: closed.** Top-1 routing is at 97.9% of the omniscient bound
  (2.00pp left); panel membership at 99.23% of its bound (0.75pp left); panel
  size resolved at 3; whether-to-panel gated adaptively on measured uplift.
- **Real-data axis: open, blocked on a schema change that is Sean's call.**
  Co-failure correlation — the input deciding whether panels ever run — is **not
  computable from `repid_score_events`**. Needs a real task key, or a join table
  linking events to task instances.

**Four numbers published here were later retracted.** They are listed with
reasons in `docs/TRUST-HARNESS.md` § "What REAL data says". Read that section
rather than reconstructing the chain from the entries below.

Two notes for anyone reading the routine's own prompt: it asserts the session
has no MCP tools and lists items 4 and 5 as open. **Both are stale** — MCP was
available on 2026-08-14 and was used read-only, and items 4 and 5 are closed as
above. The prompt says this file is authoritative over its list. It is.

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


### 13. Sprint H — `aggregate.ts`, the module the negative result asked for

Sprint G measured that the missing piece was an aggregator rather than a wiring
change. Built it: `lib/trustshell/harness/aggregate.ts` plus
`scripts/harness-aggregate-test.mjs`. **28 assertions, 236 across eight suites,
tsc 25 unchanged, next build clean, portability 12 files.**

Proposals are clustered by an answer `key` the caller supplies, clusters are
weighted by **earned** reputation, and the heaviest cluster is returned. What
this adds to the published MoA work: MoA aggregates uniformly or by a learned
gate, neither of which has any notion of a proposer that lies. Here a confident
proposer with no track record cannot buy influence over the answer.

**MEASURED, ten seeds, `wrong=scatter`:**

| arm | default world | no-gem world | calls/task | p99 |
|---|---|---|---|---|
| top-1 | 91.8% | 89.2% | 1.02 | 193 ms |
| panel of 2 | 91.1% (**−0.65**) | 88.3% (**−0.93**) | 2.00 | 213 ms |
| panel of 3 | 98.5% (**+6.69**) | 97.1% (**+7.84**) | 3.00 | 632 ms |
| panel of 4 | 99.6% (**+7.79**) | 98.9% (**+9.73**) | 3.98 | 959 ms |

**Passes the counterfactual gate and is stronger inside it** — with no planted
gem, top-1 is weaker and aggregation matters more. The exact opposite of the
`explorationRate` artefact, which evaporated under the same test.

**REGRESSION, stated plainly: panel of 2 loses in both worlds**, and the cause is
this module's own guard. `minProposals` is 2, so when one of a pair hangs the
survivor is a lone proposal and the aggregator abstains — correctly, because one
proposal has 100% support by construction. A pair has no redundancy. Do not run
panels of 2.

**The estimate that justified the build was optimistic, in the safe direction.**
Sprint G's diagnostic lens predicted +3.62pp for panel-2; the shipped module
delivers −0.65pp, because the lens counted a lone survivor as a correct answer
and the module refuses to. Better that an estimate proves too generous than too
mean — but it is a reminder that a scoring lens applied to recorded data is not
the same thing as the code that will run.

**A defect the tests found in the module.** `dominatedBySingleExpert` is meant to
say "one proposer outweighed everyone, so the panel bought nothing over top-1".
The first implementation compared the winning *cluster* against the rest, so a
two-expert bloc at 3000+3000 beating a lone 5000 reported `true` — the inverse of
the truth, since that is precisely the case where combining won it. The name and
the computation disagreed. One of the two initial test failures was my test being
wrong; this one was the module being wrong.

**MUTATION TESTED — six mutations, all caught.** Weighting removed so head count
decides: 10 failures. Tie-break ordering reduced to weight-only: 1. `minMargin`
guard removed: 2. Equivocators kept: 2. Abstain weight left in the denominator:
2. `dominatedBySingleExpert` hardcoded false: 1.

**Answer-model sensitivity is bracketed, not assumed.** `wrong=bloc` counts every
wrong answer as the same answer; `wrong=scatter` gives each its own. Panel of 3
reads 96.6% bloc, 98.5% scatter. Reality is scatter, so bloc is the floor and
both are printed.

**COST, not netted out of the gain:** 3–4× the calls, p99 193 → 632/959 ms. The
unbuilt answer is RouteMoA's — screen cheaply, escalate to a panel only when the
prior is uncertain. Nothing here changes a default; panels are opt-in and the
validity guard still reproduces the simulator exactly.

**NOT CHECKED.** Still the simulator. The `key` equivalence that decides whether
two answers are "the same" is supplied by the caller and modelled here as a
boolean right/wrong — real semantic clustering of LLM answers is the hard part
and is untested. No escalation policy exists, so the cost is currently paid on
every task rather than only on uncertain ones. And none of it is validated
against the 152,001 real labelled outcomes.


### 14. Sprint I — `escalate.ts`, and a dial mistaken for an improvement

Built `lib/trustshell/harness/escalate.ts` plus
`scripts/harness-escalate-test.mjs`. **22 assertions, 258 across nine suites,
tsc 25 unchanged, next build clean, portability 13 files.** Nothing changes a
default; the validity guard still reproduces the simulator exactly.

Panels cost 3–4× on every task. This screens first — thin margin over the
runner-up, low absolute earned score, low confidence in the leader — using only
ledger state the router already computed, so screening itself costs no calls.

**MEASURED, panel of 3, ten seeds:** always-panel +6.69pp at 3.00 calls and p99
632 ms; `margin<1000` +3.95pp at 2.15 calls, 57% escalation, **p99 258 ms**;
`margin<2000` +6.12pp at 2.83 calls; `conf<0.5` +0.19pp at 3% escalation;
`margin<2000` with a 25% cap +0.58pp.

**THE HEADLINE IS NOT WHAT IT LOOKS LIKE.** Gain per extra call is 3.51 for
`margin<1000` versus 3.38 for always-panel — a 4% difference, i.e. nothing.
**Screening does not improve the exchange rate between calls and correctness.**
What it buys is the tail: p99 632 → 258 ms, −59%, at 28% fewer calls and 41% of
the gain forgone. That is a **dial, not an improvement**, and reporting it as
"escalation is more efficient" would have been the overclaim this log exists to
catch.

**FAILED — the rate cap is worse than useless as implemented.** 1.21 pp per
extra call against 3.38 for always-panel. This is the greedy-budget limitation
written into the module docstring, now measured rather than predicted: the cap
spends budget on the first uncertain tasks it meets, which early in a run are
cold-start tasks where a panel of low-confidence experts helps least. By the
time the ledger is informative the budget is spent. Do not ship
`maxEscalationRate` below 1 until that is fixed with a windowed quantile.

**`conf<0.5` is nearly dead at the current default** — it fires on 3% of tasks,
because `confidenceK` 20 makes confidence rise fast. A floor tuned when
`confidenceK` was 50 would be badly wrong now. Config floors are coupled to
other config.

**MUTATION TESTED — five mutations, four caught immediately**, and the fifth
exposed a real coverage hole. Silent budget denial: 3 failures. Pre-increment
cap (the classic rate-limiter off-by-one): 4. A 0 floor meaning ALWAYS instead
of OFF: 3. Rate computed over escalations rather than decisions: 2.

The miss: replacing `POSITIVE_INFINITY` with `topEarned` for a missing runner-up
passed all 22 assertions. My test used `topEarned: 6000` against a `marginFloor`
of 5000, so the substituted value still cleared the floor **by luck** and the
test never distinguished the two. Lowered to 3000 against the same floor and the
mutation now fails it. Second time mutation testing has found a hole that writing
more tests from the same mental model would not have.

**One test was self-contradictory and the module was right.** I asserted the
first escalation succeeds under a 50% cap while the comment beside it said it
would be denied. It is denied — on decision 1 the rate is 1/1 = 100%, which
exceeds any cap below 1. That is a real property worth its own assertion: **a
capped policy is always refused its first panel** and needs a warm-up of quiet
decisions, so a low cap on a short run yields zero panels rather than "a few".

Counterfactual gate passed: `margin<1000` gives +4.39pp in the no-gem world.

**NOT CHECKED.** Still the simulator. The three floors were chosen by hand and
swept coarsely — no holdout/counterfactual discipline was applied to the floor
VALUES themselves, so they may be fitted to this world. Escalation is measured
only at panel size 3. And none of it touches the 152,001 real labelled outcomes.


### 15. Sprint J — the greedy budget fix that did not work

Asked to fix the greedy budget cap. Built the documented fix — a windowed
quantile allocator that spends on the MOST uncertain tasks rather than the
earliest — measured it, and **removed it**. It produced exactly zero
improvement.

**261 assertions, 0 failures; escalate suite 22 → 26. tsc 25 unchanged.**

**MEASURED.** Twenty mild tasks then five severe ones, 20% cap:

| config | severe caught | mild burned | rate |
|---|---|---|---|
| floor 1000, greedy | 1/5 | 4 | 0.20 |
| floor 1000, quantile | **1/5** | **4** | 0.20 |
| floor 500, greedy | **5/5** | **0** | 0.20 |

**The quantile allocator changed nothing. A tighter floor fixed it completely at
the same cap.** So the finding is that `maxEscalationRate` is a safety ceiling,
not an allocator: bound spend with the cap, decide what deserves a panel with
the floors.

**Why it cannot be patched.** An online quantile is estimated from tasks already
seen, so it cannot reserve budget for a severity it has never observed. Mild
tasks arriving first define the distribution, clear their own threshold, and take
the budget. Reserving for the unseen needs lookahead or a prior, and neither is
available. That is a property of online allocation, not a bug in the code.

**An intermediate version was also wrong, and measurement caught it.** Selecting
on the quantile ALONE overshot the 20% cap to **68%** — a tied mass of equally
uncertain tasks all clear a threshold equal to their own value, so `>= threshold`
admits the whole tie at once. Adding the cap back as a second gate fixed the
overshoot and left the allocator useless, which is what led to testing the floor
instead.

**A probe of my own was degenerate and nearly produced a false positive.** An
"interleaved arrival" scenario showed greedy catching 5/5 severe tasks and looked
like evidence that arrival order was the whole story. It was an artefact: the 20%
cap exactly matched the 20% severe frequency, so greedy's periodic escalation
aligned with the severe tasks by coincidence. Caught before it was written down.

**REMOVED rather than shipped.** Machinery that does not do what its name claims
is the defect this codebase exists to catch — the same judgement as the fleet
endpoint over an empty table. The `uncertainty` score was KEPT: it is what
diagnosed all of the above, and it lets a caller see how far short a task fell
rather than only whether a boolean tripped.

**MUTATION TESTED — and it found a second coverage hole.** Averaging the signals
instead of taking the worst: caught. Removing the `[0,1]` clamp: **passed all 25
assertions**, because nothing exercised a shortfall above 1. A runner-up scoring
above the leader gives a negative margin and an unclamped score of 5.0, breaking
the documented contract and outranking a genuinely maximal 1.0. A 26th assertion
now covers it. Third time mutation testing has found a gap that writing more
tests from the same mental model would not have.

**NOT CHECKED.** The floor VALUES that make this work (500 vs 1000) were derived
from one synthetic two-tier workload. Real uncertainty distributions are not
two-tier, and no holdout or counterfactual discipline was applied to the floor
values themselves. The claim "tighten the floor" is directionally supported and
its magnitude is not.


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

---

## Sprint K — abandonment accounting, and the sprint loop STOPS

**Item taken:** *Cancellation*, from the `TRUST-HARNESS.md` "Not yet built"
list — which the sprint prompt names as authoritative over its own backlog.

**Why not backlog item 5.** The prompt's item 5 says to propose
`hal_quorum_receipts` / `hal_quorum_validator_votes` because "a writer targets
them". Grepped the whole repo for `hal_quorum`, `quorum_receipt`,
`validator_vote`, and `from('hal…')`: **the writer does not exist here.** The
claim comes from a live-DB audit of another surface, and this session has no
Supabase. Writing a schema for a writer I cannot read means inventing column
names and shipping a file that looks authoritative and is guesswork — the exact
defect this repo catalogues. Left undone, deliberately, with the reason stated.

### What was built

`release`-on-timeout was a false assertion. `TimeoutPolicy` detects a hang and
the caller stops waiting; it cannot stop the EXPERT, because it holds no handle
on the transport. Handing the slot back claims we watched the call end, which we
did not. The gap between "gave up" and "ended" is where a hung expert holds a
slot the governor believes is free — a **phantom slot**.

- `capacity.ts` — `strand()` / `reclaim()` / `stranded()` / `committed()` /
  `available()`. Three dispositions for a slot, not two. `acquire()` and the
  router's gate both measure `committed`, so a stranded slot cannot be handed
  out twice. `slots()` is deliberately NOT reduced: rated capability and claims
  against it are different things.
- `timeout.ts` — an abandonment ledger. `sweep()` moves an expiry into it
  instead of forgetting it; `settle(id, disposition)` accounts for it as
  `confirmed_dead` / `returned_late` / `presumed_dead`. `complete()` on an
  abandoned attempt settles it as a late return rather than returning null, so a
  recovered expert does not read as a permanent leak. `unsettled()` is a leak
  gauge and **nothing drains it on a timer** — that would make the leak
  invisible again.
- `harness-simulate.mjs` — hang path strands instead of releasing, with the
  caller owning the abort grace period. The governor never invents one.

### What improved

**Nothing measurable. Say it plainly: this produced no performance gain.**

| scenario (W = concurrency) | calls sunk into hangs | useful completions |
|---|---|---|
| always hangs, W=1..8 | release 3/4/4/6 → strand 3/4/4/6 | +0.0% |
| hangs 45%, W=1..8 | release 4/4/4/6 → strand 4/4/4/6 | +0.0% |
| hangs 45%, ledger blind (ablation) | release 8/6/4/7 → strand 8/6/4/7 | +0.0% |

Full sim unchanged and re-verified: correctness **92.3%**, tau **0.643**, p99
**179**, hangs 1. The experiment script's validity guard still reports MATCH.

### What the measurement actually found — after two wrong guesses

Guess 1 was "the circuit breaker covers it". Half true: `failureCount` in
`circuit-breaker.ts` is **consecutive** and reset by every success, so an
intermittent hanger never trips it. Built that scenario. Still zero.

Guess 2 was "the reputation ledger covers it". Ablated the ledger so hangs
produce no reputation signal. **Still zero.** Two mechanisms named, neither was
the answer — so I instrumented instead of guessing again.

Guess 3 was written into the script before it was measured, and was wrong:
"slots collapse before a second call can be stranded". The instrumentation says
**peak stranded = 6**. The stranding is real and substantial. What kills the
effect is the ORDER:

1. All 6 calls are admitted **in the first tick, at full base slots, before one
   hang has been observed**. No slot accounting can prevent that — there was
   nothing yet to account for.
2. They all hang. `capacity.observe(expert, elapsedMs, ok=false)`, already
   called on every expiry since Sprint C, folds a 1500 ms sample into the
   latency EWMA *and* divides the allowance by `consecutiveErrors`, collapsing
   slots 6 → **minSlots=1**.
3. The expert is never selected again, **in either arm**. Every admission
   stranding would have blocked was already blocked by a 1-slot allowance.

So the mechanism is correct and **redundant** — redundant against a layer an
earlier sprint wired. It stops being redundant against a transport that hangs
without producing a latency sample to observe.

### Kept, unlike the quantile allocator — and why that is not special pleading

Sprint J removed the quantile allocator because it did not do what its name
claimed. This is a different case and the distinction is load-bearing:
`strand`/`reclaim` does exactly what it claims, at zero measured cost, and it is
the only thing in the harness that can represent "gave up, still running". The
old arm books every abandonment as `presumed_dead` **and** a free slot — it
reports an accounting it never performed. That is the recurring defect of this
codebase, and removing the fix because the throughput delta is zero would
restore it. **Observability gain, not a performance gain. Not dressed up as one.**

### Evidence

278 assertions, 0 failures (routing 52 ↑7, timeout 38 ↑9, consensus 46,
mcp-fleet 35, aggregate 28, escalate 26, transform 31, reputation 22).
`tsc --noEmit` 25 — baseline, unchanged. `next build` clean. Portability holds.

Five mutations, all caught:

| mutation | result |
|---|---|
| `strand()` behaves like `release()` | 4 failures |
| router gate uses `inFlight` not `committed` | 1 failure |
| `acquire()` uses `inFlight` not `committed` | 1 failure |
| `sweep()` deletes without recording | 7 failures |
| `complete()` returns null for an abandoned attempt | 1 failure |

### NOT CHECKED

- Whether stranding pays against a real transport. Every number above is from
  the modelled world; the case where it would matter (a hang with no latency
  signal) is not reachable in this simulator.
- Nobody calls `strand`/`reclaim` outside the simulator. `lib/mcp/fleet.ts`
  still has no in-flight accounting to strand.
- Real-data replay (152,001 labelled outcomes) — needs Supabase. Sean-gated.

---

# STOPPED

The sprint loop is disabled. **Two stop conditions hold independently:**

1. **Two consecutive firings with no measurable improvement.** Sprint J (the
   quantile budget allocator) measured exactly zero and was removed. Sprint K
   measured exactly zero and was kept on correctness grounds. Two in a row is
   the documented stop, and it is the correct read: the harness's remaining
   defects are no longer the kind that a further increment moves.
2. **Backlog exhausted.** Items 1–3 are built (timeout split, transform,
   Postgres reputation store — the last blocked on an unapplied migration).
   Item 4 (sub-task routing granularity) was judged architecturally significant
   on 2026-08-13 and belongs to Sean. Item 5's premise is false in this repo,
   as recorded above.

**What should happen next is a decision, not another increment.** The single
highest-value open item is **Phase 0.1, the real-data replay**: run the 152,001
labelled outcomes in `repid_score_events` through `ReputationLedger`. No schema
change, no migration, no risk. It would convert every number in this log from
simulator evidence to real-data evidence — which is the standing NOT CHECKED
that caps the value of everything above it. It needs Supabase and it needs Sean.

Also awaiting Sean, unchanged:
`supabase/migrations/20260813210000_agent_repid_earned_observations.sql`,
written and deliberately not applied.

---

## Sprint L — the ceiling, and the first non-zero result in three sprints

**RESUMED at the user's explicit direction**, overriding the STOPPED marker
above. That marker stays in the record: it was the correct call under the
sprint-loop contract, and it was also the wrong conclusion about the *system* —
the loop had run out of increments, not out of headroom. What it was missing is
below.

### The question nobody had asked

Sprints J and K both measured exactly zero. Two zeros in a row is data, not bad
luck, and the response to it should not have been a third increment. It should
have been: **how much room is there, and where?** That had never been measured.

It is computable. No top-1 router, however perfect, can beat the best expert
available to it. So the bound was calculated three ways — analytically from the
world model, by running an omniscient router that always picks the
instantaneously best expert, and against what the harness actually achieves:

| | correctness |
|---|---|
| best single expert, perfect knowledge (analytic) | 94.05% |
| **omniscient top-1 router, measured** | **94.25%** |
| the harness, top-1 | 92.25% |
| naive baseline | 41.85% |

**The harness was already at 97.9% of the omniscient top-1 bound.** The entire
remaining prize for any router, scheduler, capacity or timeout change was
**2.00pp**. That is the whole explanation for Sprints J and K, and it would have
been the explanation for anything else built in that direction. The other
**5.95pp** is the best available expert simply being wrong — unreachable by
choosing better, because there is nothing better to choose.

**This should have been the first measurement taken, not the twelfth.** Every
sprint since H was optimising a component near its ceiling without knowing where
the ceiling was.

### What crosses it

Only combining experts can beat the best single expert, and `aggregate.ts` had
measured +6.5pp doing exactly that since Sprint H — **while never being wired
into the harness arm**. The biggest measured win in the codebase was sitting in
the experiment script. So it was wired in: escalation screens (free, ledger-
derived), and when the leader's margin is thin a panel of 3 runs and the
earned-weighted plurality is taken.

| arm | correct | calls/task | p99 |
|---|---|---|---|
| omniscient top-1 CEILING | 94.25% | 1.00 | — |
| harness, top-1 | 92.25% | 1.02 | 179 ms |
| **harness + escalated panel** | **96.95%** | 2.77 | 216 ms |

**+4.70pp over top-1, and +2.70pp over the omniscient top-1 ceiling — crossed.**
2.69pp per extra call. Escalated on 88% of tasks; 235 screened out as clear
picks.

**Under the PESSIMISTIC wrong-answer model.** The headline uses `wrong` as a
single key, so every wrong answer agrees and can out-vote the one correct
answer. Reality is the opposite — many ways to be wrong, one way to be right.
`--scatter-wrong` measures that: **98.20%**. The pessimistic number is the one
reported.

### Robustness — 7 seeds, not 1

| seed | ceiling | top-1 | panel (bloc) | panel (scatter) |
|---|---|---|---|---|
| 20260813 | 94.25 | 92.25 | 96.95 | 98.20 |
| 1 | 93.85 | 91.65 | 96.10 | 98.05 |
| 2 | 94.50 | 91.05 | 96.10 | 98.00 |
| 3 | 94.30 | 92.90 | 96.05 | 97.75 |
| 4 | 94.50 | 91.95 | 96.00 | 97.80 |
| 5 | 94.70 | 91.70 | 96.30 | 97.60 |
| 6 | 94.30 | 91.60 | 97.15 | 98.60 |

Panel beats top-1 on **every** seed (+3.15 to +5.55pp) and beats the omniscient
ceiling on **every** seed (+1.55 to +2.85pp), pessimistic model throughout.

### The confound, killed rather than hand-waved

A panel gathers ~3× the observations per escalated task, so its ledger is better
informed and would route better **even if the extra answers were discarded**.
That would make "aggregation" a mislabel for "more evidence". Ablation: call the
panel, teach the ledger, then take the LEADER's answer and throw the rest away.

| arm | correct | Δ |
|---|---|---|
| top-1, one call | 92.25% | — |
| panel called, leader's answer taken (evidence only) | 90.80% | **−1.45pp** |
| panel called, plurality answer taken | 96.95% | +4.70pp |

Extra evidence contributes **−1.45pp** — slightly *negative*. Aggregation itself
contributes **+6.15pp**. The entire gain is the mechanism.

### Cost, not netted out

p99 179 → 216 ms (+21%). Calls/task 1.02 → 2.77 (+171%). A panel pays its
slowest member rather than the sum, which is why latency rises far less than
call count. Both are stated; neither is subtracted from the headline.

### A bug found by the instrumentation

The first "picked the instantaneous best" counter reported `0/0`. The loop
variable `attempt` is shadowed inside the loop body by the `AttemptHandle` from
`timeouts.begin()`, so `attempt === 0` compares against an object and is always
false. Fixed to key off `tried.length`. A counter that reads 0/0 is visibly
broken; one that read a plausible-but-wrong number would not have been.

### Evidence

278 assertions, 0 failures. `tsc --noEmit` 25 — unchanged. `next build` clean.
Portability holds. The experiment script's validity guard still reports MATCH
(92.3% / 179 / 0.643), so the top-1 arm is byte-for-byte what it was — the panel
is a third arm, not a modification of the measured one.

### What this changes about the earlier sprints

Nothing measured in J or K was wrong. What was wrong was the **choice of what to
work on**, and no amount of rigour inside a sprint corrects for that. The
recurring lesson of this repo has been "suspect the measurement before the
code". Sprint L adds: **suspect the target before either.** Measure the ceiling
first; a mechanism at 97.9% of its bound has 2pp to give no matter how well it
is built.

### NOT CHECKED

- Everything above is the modelled world. The panel gain depends on how
  correlated expert errors really are — modelled here as fully correlated
  (pessimistic) and fully independent (`--scatter-wrong`). Real experts sit
  somewhere between, and where they sit decides the real number.
- The escalation config (`marginFloor: 2000`, panel of 3) was chosen from the
  experiment sweep and confirmed across 7 seeds, but not on a held-out world.
- Real-data replay (152,001 labelled outcomes) — still needs Supabase.

---

## Sprint M — the assumption Sprint L rested on, and where it breaks

Sprint L's +4.70pp rests on one modelling assumption that had never been
stated as a load-bearing one, let alone tested: **each expert's correctness is
an independent draw.** A panel of 3 is worth paying for precisely because it
buys three independent chances. Real experts fail on the *same hard tasks*, and
to the extent they do, the extra calls buy nothing at full price.

This is a sharper risk than the wrong-answer-correlation bracket already
reported. That bracket was already resolved — the panel beats the ceiling at
BOTH endpoints (bloc 96.95%, scatter 98.20%), so every value between them is
covered. Error correlation *through the task* is a different axis entirely, and
the world model had none of it: every task was identical and only the expert
varied.

### The mechanism added

`--hardness W` makes difficulty a per-task property every expert shares, drawn
from a dedicated stream and **shared across all arms** so they see the identical
difficulty sequence. The shock is symmetric around the mean, so average quality
is unchanged and only task-to-task variance rises — otherwise the experiment
would just be "make the world harder" and everything would drop together.

`W=0` is byte-identical to the published world: 92.3% / p99 179 / tau 0.643, and
the experiment script's validity guard still reports MATCH.

### The result — the gain decays, then inverts

| W | ceiling | top-1 | panel | panel−top1 | panel−ceiling |
|---|---|---|---|---|---|
| 0 | 94.25% | 92.25% | 96.95% | **+4.70pp** | +2.70pp |
| 0.1 | 93.25% | 91.20% | 96.45% | +5.25pp | +3.20pp |
| 0.2 | 90.75% | 88.10% | 93.00% | +4.90pp | +2.25pp |
| 0.3 | 88.25% | 86.80% | 90.75% | +3.95pp | +2.50pp |
| 0.4 | 85.15% | 83.45% | 87.20% | +3.75pp | +2.05pp |
| 0.6 | 80.15% | 79.00% | 81.55% | +2.55pp | +1.40pp |
| 0.8 | 75.40% | 72.95% | 73.60% | +0.65pp | **−1.80pp** |
| 1.0 | 71.20% | 68.65% | 67.80% | **−0.85pp** | **−3.40pp** |

Confirmed across 3 seeds at the boundary:

| W | seed 20260813 | seed 1 | seed 2 |
|---|---|---|---|
| 0.6 | +2.55pp | +0.85pp | +3.80pp |
| 0.8 | +0.65pp | +0.05pp | −0.05pp |
| 1.0 | −0.85pp | +0.05pp | −0.70pp |

**The panel's advantage collapses to zero at W ≈ 0.8 and inverts at 1.0 — while
still costing 2.77× the calls.** Against the omniscient ceiling the crossover is
earlier, around W ≈ 0.7.

### What this means for the Sprint L claim

It is not overturned and it is not unconditional. **It holds while expert errors
are substantially independent, and it becomes pure cost when shared task
difficulty dominates.** Any future quotation of "+4.70pp" without that condition
attached is a misreport.

There is also a mild non-monotonicity worth not over-reading: W=0.1 beats W=0
(+5.25 vs +4.70pp). A little difficulty variance creates more tasks where the
leader is genuinely uncertain, which is exactly what escalation is looking for.
On one seed at one setting, that is a curiosity, not a finding.

### The decision rule this produces

The condition is measurable on real traffic *before* enabling anything:
**how often do two experts get the SAME task wrong?** That single statistic
locates a deployment on the table above. Nothing in the harness currently
measures it, which makes it the natural next build — and it is also the first
thing the 152,001-outcome replay could answer, since those outcomes are labelled
and joinable per task.

### Evidence

278 assertions, 0 failures. tsc 25 unchanged. Validity guard MATCH. `W=0`
reproduces the published world exactly, so the flag is additive.

### NOT CHECKED

- Where real Trinity experts actually sit on the W axis. Unknown, and it is the
  whole question.
- The shock model is uniform and symmetric. A heavy-tailed difficulty
  distribution (a few very hard tasks) may behave differently from a broad one.

---

## Sprint N — building the gate, and finding my own statistic was the wrong one

Sprint M ended by naming the missing measurement: **how often do two experts get
the same task wrong?** That single number decides whether a panel is worth
running, it varies by deployment, and nothing in the harness measured it. Built
it: `lib/trustshell/harness/agreement.ts`, portable, 23 assertions.

### What it measures, and why a ratio

For every pair of experts observed on the same task:

```
observed   P(both wrong)
expected   P(a wrong) * P(b wrong)     <- what independence would predict
lift       observed / expected
```

The denominator is load-bearing. Two experts that are each wrong 80% of the time
are both wrong on ~64% of tasks — an enormous raw co-failure rate that says
nothing whatsoever about correlation. A test asserts exactly that case reads as
lift ≈ 1.0, and it fails if the denominator is dropped.

Pairwise rather than fleet-averaged, because correlation is not uniform: two
experts on the same base model fail together, a third on a different stack may
not. `mostIndependentPair()` names the panel actually worth running, which is
generally **not** the two highest-earning experts.

It reports `null`, never a default, when there is no evidence. A default of
"assume independent" would recommend panels in precisely the deployment where
they lose money.

### Validating an estimator against a knob — and the estimator failing

The simulator is the one place this can be *validated* rather than merely run,
because `--hardness W` makes the true correlation a knob:

| W | lift (proxy) | true panel gain |
|---|---|---|
| 0 | 0.77 | +4.70pp |
| 0.2 | 1.77 | +4.90pp |
| 0.4 | 2.14 | +3.75pp |
| 0.6 | 2.21 | +2.55pp |
| 0.8 | 2.23 | +0.65pp |
| 1.0 | 2.28 | −0.85pp |

**Lift is a good detector and a poor dial.** It moves decisively from 0.77 to
1.77 as correlation appears, then **saturates at 2.1–2.3 across the entire
region where the panel's value falls from +3.75pp to −0.85pp.** A gate on
"lift > 2 ⇒ no panel" would disable panels at W=0.4 where they still pay 3.75
points.

The saturation is structural, not tuning. Lift is bounded above by
`1 / P(b wrong)`, and that ceiling *falls* as tasks get harder — cancelling the
rise it is supposed to report. No threshold fixes that.

### Measuring the decision instead of a proxy for it

The leader's own proposal is already among the panel's proposals, so **how often
the aggregated answer beat the leader's** is measurable at zero extra cost, with
no counterfactual re-run and no assumption about correlation. That is not a
proxy for the gain; it is the gain, restricted to the tasks where it applies.

| W | lift (proxy) | uplift (direct) | rescued/spoiled | true gain |
|---|---|---|---|---|
| 0 | 0.77 | +7.28pp | 141/16 | +4.70pp |
| 0.2 | 1.77 | +6.54pp | 149/31 | +4.90pp |
| 0.4 | 2.14 | +3.27pp | 127/66 | +3.75pp |
| 0.6 | 2.21 | +1.85pp | 115/82 | +2.55pp |
| 0.8 | 2.23 | +0.38pp | 106/99 | +0.65pp |
| 1.0 | 2.28 | **−1.19pp** | **77/99** | **−0.85pp** |

Monotone throughout, crosses zero where the real gain crosses zero, and within
about a point of truth everywhere. `rescued`/`spoiled` tells the story on its
own: the panel goes from rescuing **9× more than it spoils** to **spoiling more
than it rescues**.

`upliftPp` reads high at low W because it is measured only over escalated tasks
(88% of them) while the true gain is over all tasks. That is a denominator
difference, not disagreement, and it does not affect the sign or the crossing
point — which is what a gate needs.

**`rescued` and `spoiled` are reported apart, never only as a net.** A panel
that rescues 200 and spoils 190 nets +10 and is a coin flip dressed as a
mechanism; one that rescues 60 and spoils 0 nets less and is strictly better. A
test asserts the two are distinguishable, and fails if only the net is stored.

### The honest shape of this sprint

I built a statistic, validated it against ground truth, **found it unfit for the
job I built it for, and said so in the module header rather than shipping a
threshold on it.** Both statistics are kept: lift answers "are these experts
correlated at all", which is diagnostic and true; uplift answers "is this panel
paying", which is the decision. Only the second should be gated on.

The pattern this repo keeps hitting is a system reporting success it has not
earned. A saturating proxy with a threshold bolted on would have been exactly
that — a gate that looked principled and fired in the wrong place.

### Evidence

301 assertions, 0 failures (agreement 23 new). `tsc --noEmit` 25 — unchanged.
`next build` clean. Portability holds. Validity guard MATCH; the published
world is untouched at 92.3% / 179 / 0.643.

Four mutations, all caught:

| mutation | result |
|---|---|
| report raw co-failure instead of the ratio | 5 failures |
| default to "independent" with no evidence | 1 failure |
| assign pair counts by position, not identity | 1 failure |
| drop the rescued/spoiled split, keep the net | 2 failures |

### NOT CHECKED

- **The chicken-and-egg is real and unsolved.** A pair is measurable only on
  tasks where both were called, which a top-1 router never does. So uplift
  requires already running panels. That is an explore/exploit problem — run a
  small share of panels purely to measure — and it is not built. The module
  reports `confident: false` rather than pretending otherwise.
- Nothing consumes either statistic yet. `EscalationPolicy` does not read them;
  wiring uplift into the escalation decision is the next build, and it needs the
  exploration policy above to have any data to read.
- Where real Trinity experts sit. Still the whole question, still needs the
  152,001-outcome replay.

---

## Sprint O — the adaptive gate, and an invalid mutation caught for the third time

Sprint N built the measurement and left the decision unbuilt. This closes it:
`AdaptivePanelPolicy` in `agreement.ts` learns from measured uplift whether
panels pay **in this fleet**, and turns them off when they do not.

### Why a gate at all

Two fixed policies each win half the range and lose the other half:

| | W=0 | W=1.0 |
|---|---|---|
| never panel (top-1) | 92.25% | **68.65%** |
| always panel | **96.95%** | 67.80% |

Neither can be the right default, because the right answer is a property of the
deployment and is not knowable in advance. So decide by measuring.

### The design decisions that carry weight

- **It gates on `panelUplift`, never `fleetLift`.** Lift saturates (Sprint N):
  2.14 where the panel still pays +3.75pp, 2.28 where it loses. A threshold on
  it fires in the wrong place.
- **Exploration never stops.** While exploiting a "panels do not pay" verdict, a
  5% trickle still runs one. Without it the decision is a one-way door: one
  unlucky warmup and panels never run again, whatever the fleet later does. That
  5% is the standing cost of being able to change your mind, and it is charged
  visibly.
- **Deterministic, not random.** Exploration fires on a counter. The portability
  check forbids runtime globals, and a counter is exactly reproducible under
  replay — two runs of the same workload make the same decisions.
- **A break-even panel is declined.** `minUpliftPp` defaults above 0, because a
  panel that breaks even still costs 3× the calls.

### It works, and it picks correctly without being told

| W | top-1 | always | adaptive | vs better fixed | calls always→adaptive |
|---|---|---|---|---|---|
| 0 | 92.25% | 96.95% | **96.95%** | +0.00pp | 2.77 → 2.77 |
| 0.4 | 83.45% | 87.20% | **87.75%** | +0.55pp | 2.91 → 2.39 |
| 0.8 | 72.95% | 73.60% | **74.60%** | +1.00pp | 2.90 → 1.26 |
| 1.0 | 68.65% | 67.80% | **68.75%** | +0.10pp | 2.92 → 1.27 |

Its own verdicts, which are what drove those decisions:

| W | panels run | exploration | measured uplift |
|---|---|---|---|
| 0 | 1765 | 0 | +7.28pp → pure exploit |
| 0.4 | 1385 | 39 | +3.94pp → mostly on |
| 0.8 | 245 | 100 | **−2.11pp → turned off** |
| 1.0 | 246 | 100 | **−3.36pp → turned off** |

Across 3 seeds it matches always-panel **exactly** at W=0 (+0.00pp, 3/3) and
beats the better fixed policy at W=0.8 (+1.00 / +1.10 / +1.65pp, 3/3).

**One result is NOT what it looks like.** On seed 2 at W=0.8 the adaptive arm
scored +1.65pp while using 2.83 calls against always-panel's 2.88 — it barely
declined anything, so that gain cannot be the gate deciding well. It is
path-dependence: panelling a slightly different set of tasks shifts the ledger
and every downstream routing choice. The reliable, attributable claim is the
call reduction at high W (2.90 → 1.26, −57%) with correctness held or improved.

### The methodology failure, third instance today

The mutation "gate on `fleetLift` instead of uplift" reported **31 passed, 0
failed** and then **33 passed, 0 failed**. Both readings were worthless: the
mutation **does not compile**. Removing the `u.upliftPp !== null` guard leaves
`u.upliftPp.toFixed(2)` unguarded in the branch below, and TypeScript rejects
it — the runner printed `harness compilation failed`, which my grep pattern did
not match, so the absence of a failure line read as a pass.

Rewritten to keep the null guard and swap only the criterion, it fails **3**
assertions. **The hole was real and is now closed** by two new tests:

- a fleet whose experts genuinely fail together (lift > 2) whose panels
  nonetheless rescue far more than they spoil — the gate must follow the uplift;
- its mirror, a fleet that looks independent (lift ≈ 1.0) whose panels
  measurably lose — so the first test cannot be satisfied by ignoring evidence.

Before those, gating on the saturating proxy was undetectable by the suite —
in the sprint whose entire finding was that the proxy is the wrong thing to gate
on.

**Standing rule, restated because it keeps being violated:** a mutation that
does not compile is not evidence. Grep for the compile-failure line, not only
for the failure count.

### Evidence

341 assertions, 0 failures (agreement 33, +10). `tsc --noEmit` 25 — unchanged.
`next build` clean. Portability holds. Validity guard MATCH; the published world
is untouched at 92.3% / 179 / 0.643.

Mutations, all caught once written validly:

| mutation | result |
|---|---|
| gate always returns panel | 2 failures |
| exploration dropped (one-way door) | 1 failure |
| gate on fleetLift instead of uplift | 3 failures |

`if (false) {` was also tried for the exploration mutation and produced no
output — dead-code elimination, another non-mutation. Re-run as
`explorationRate > 999` it fails correctly.

### NOT CHECKED

- Warmup costs panels in a fleet where panels lose. 150 panels of ~2000 tasks
  is ~7.5%, unmeasured as a standalone cost.
- The estimate is lifetime, not windowed. A fleet that changes character
  mid-run is corrected only at the rate exploration feeds new evidence, and
  nothing measures that lag.
- Still simulator-only. Where real experts sit on the W axis remains the whole
  question, and still needs the 152,001-outcome replay.

---

## Sprint P — the panel's own ceiling, before tuning the panel

Sprint L's lesson applied one level up, deliberately, before repeating its
mistake. Having established that top-1 routing sat at 97.9% of its bound, the
obvious next move was to tune the panel — size, thresholds, membership. That is
precisely the move Sprint L showed to be unwise **without first measuring the
bound**. So the bound came first.

`runOraclePanel` picks members by true instantaneous quality instead of earned
reputation, then aggregates identically under the same pessimistic wrong-answer
model. Membership is omniscient; **weighting deliberately is not** — weights stay
uniform, because a ledger that already knew the truth would make the whole
harness unnecessary and the bound meaningless.

| arm | correct |
|---|---|
| omniscient TOP-1 ceiling | 94.25% |
| omniscient PANEL of 3 ceiling | 97.70% |
| omniscient PANEL of 4 ceiling | **99.70%** |
| omniscient PANEL of 5 ceiling | 99.40% |
| the harness panel of 3 (earned) | 96.95% |

**The panel arm is at 99.23% of the omniscient panel-of-3 bound. Choosing
members better is worth 0.75pp — it is done.** Any further work on panel
membership selection is the Sprint J/K mistake a third time.

Size is a different axis, and the ceilings said 4 was worth 2.00pp more than 3.
Measured in the real arm:

| size | correct | calls/task | p99 | ceiling |
|---|---|---|---|---|
| 2 | 92.65% | 1.79 | 183 ms | — |
| **3** | **96.95%** | **2.77** | **216 ms** | 97.70% |
| 4 | 98.20% | 3.80 | **859 ms** | 99.70% |
| 5 | 98.00% | 4.63 | 912 ms | 99.40% |

### Panel of 3 stays the default, and the reason is the p99

Going 3 → 4 buys **+1.25pp for +37% calls and +298% p99** (216 → 859 ms). The
latency is the disqualifier, not the call count: a panel pays its SLOWEST
member, and the fourth-ranked expert in this pool is `decayer` at 6× latency or
a staller costing the full idle deadline. The marginal return also halves —
2.69pp per extra call going top-1 → 3, but 1.21pp per extra call going 3 → 4.

**5 is strictly dominated**: lower correctness than 4 (98.00% vs 98.20%) at
higher cost, and its ceiling is lower too (99.40% vs 99.70%). The fifth-best
expert in this pool is bad enough to add wrong votes faster than right ones.
That is a property of THIS pool's quality distribution, not a general law about
panel sizes, and should not be quoted as one.

### What is now closed on this axis

- Routing: 2.00pp from the bound. Closed (Sprint L).
- Panel membership: 0.75pp from the bound. Closed (here).
- Panel size: 3 is the cost-adjusted optimum; 4 is available if latency is free;
  5 is dominated. Closed.
- Whether to panel at all: measured and gated adaptively (Sprints N, O).

**Everything reachable inside the simulator on this axis has now been reached.**
What remains is not a tuning question, and no further increment against this
model will produce a number worth having.

### Evidence

341 assertions, 0 failures. `tsc --noEmit` 25 — unchanged. `next build` clean.
Portability holds. Published world verified unchanged at 92.3% / p99 179 /
tau 0.643 after the `alternatesCount` change — that parameter feeds only the
panel path, since the top-1 arm re-routes by exclusion rather than by reading
the alternates list. Checked by running it, not by reading it.

### NOT CHECKED

- The panel ceilings use uniform weights. A ceiling with omniscient WEIGHTING
  too would be higher, and is not computed, because it is not a bound any real
  system could approach.
- Panel sizes above 5 are unmeasured; with 8 experts and this quality
  distribution they would include experts whose true quality is 0.35.
- Everything remains simulator-only. Five sprints have now ended on this same
  line, which is itself the finding: **the binding constraint is no longer the
  harness, it is the absence of real data.** The 152,001 labelled outcomes in
  `repid_score_events` would settle where real experts sit on the W axis, which
  is the one input that decides whether any of this runs in production.

---

## Sprint Q — the replay, and a finding that changes what it is worth

Sprint P closed the simulator axis: routing 2.00pp from its bound, panel
membership 0.75pp from its bound, panel size resolved, whether-to-panel gated
adaptively. The binding constraint became the absence of real data. So this
sprint took the one item left on the critical path and removed it from that path
as far as is possible without credentials.

`scripts/repid-replay.mjs` (`npm run repid:replay`). Read-only: SELECTs only, no
migration, nothing touched that is Sean-gated. `--dry-run` introspects and stops.

### The finding, which matters more than the script

**The replay answers two different questions, and only one of them is certainly
answerable from this table.**

- **Q1 — does the ledger rank real agents sensibly?** Needs `agent_id` and an
  outcome column. Both are recorded as existing. **Answerable.**
- **Q2 — where does the real fleet sit on the correlation axis?** This is the
  question blocking Sprints L–P. It decides whether panels run at all: the
  panel's value swings from +4.70pp to −0.85pp across that axis. **Q2 needs a
  column grouping events by TASK, and no such column is recorded anywhere in
  this repo.**

Only `agent_id` and `decision_outcome` are documented (ROADMAP §1.2, §1.3).
Grepped the whole repo: nothing references a task, decision, request or
correlation id on `repid_score_events`. If none exists, **the replay validates
the ledger but does not settle the panel question**, and six sprints of
conditional results stay conditional.

That is worth knowing before anyone schedules the work, and it is why the script
**introspects the schema first and reports what is missing** rather than
assuming a column name. Substituting a timestamp bucket or any other proxy for a
real task key would report a correlation that is an artefact of the join — a
number that looks like the answer and is not. The script says so explicitly and
refuses to do it.

Same standard as declining backlog item 5's migration: **discover the schema, do
not assert one.**

### What it does with the parts that are certain

- Replays outcomes through the real `ReputationLedger` at harness defaults.
- Maps `decision_outcome` **explicitly and case-folded** — the enum has 13
  values over 152,001 rows including case-duplicate pairs (`approved` 46 /
  `APPROVED` 30) and values that are not outcomes at all (`test`, `profit`,
  `RESTORE`). Unrecognised values are counted as **unmapped and excluded, never
  defaulted**; a default either way would manufacture the result. It prints the
  unmapped values so a new one surfaces instead of being absorbed.
- Reads `repid_score_events` directly rather than joining to `agent_repid`, so
  it does **not** inherit the 43% join leak — at the cost of reporting UUIDs.
- Derives earned score and confidence through the ledger's own accessors rather
  than re-implementing shrinkage, so the two cannot drift.

### Caveats the script prints itself

- **No `ORDER BY`.** The ledger's EWMA is order-dependent, so scores are
  indicative until re-run ordered by the real event timestamp. Flagged in output
  rather than left for a reader to notice.
- **The outcome mapping is a judgement, not a fact.** `vetoed` (115,885) and
  `flagged` (21,976) are read as failures. If `flagged` means "held for review"
  rather than "wrong", 137,861 rows change meaning and so does every score.
  Printed as CONFIRM THIS BEFORE PUBLISHING.

### Verified without a database

Both failure paths, by running them:

| condition | behaviour |
|---|---|
| no credentials | `NOT MEASURED`, exit **2**, nothing queried |
| unreachable host | `Nothing below can be trusted. Stopping rather than guessing.`, exit **1** |

Neither path reports empty data as a finding, which is the failure mode this
repo keeps catching. Client construction follows `scripts/north-star.mjs`: lazy,
inside `main()`, documented key names, and no dummy fallback — a dummy returns
empty result sets that read as "no data" instead of "misconfigured".

341 assertions unchanged, `tsc` 25, published world untouched.

### NOT CHECKED

- **The script has never been run against the real database.** Its behaviour on
  live data is unverified, by construction. It is written to fail loudly rather
  than quietly, and that is all that can be claimed for it.
- Whether a task key exists at all. `--dry-run` answers this in one command and
  costs nothing; that is the single most informative thing anyone with
  credentials can do next.

---

## Sprint R — the database answered, and it corrected me twice

The Supabase MCP tools were available after all. Every query below is
**read-only** — SELECTs against `information_schema` and `repid_score_events`.
No migration, no write, nothing Sean-gated touched.

### Correction 1: the table has 37 columns, not 2

Sprint Q concluded "no task-grouping column is recorded anywhere in this repo."
That was true **of the docs** and I stated it as if it were true of the table.
The table has 37 columns including `llm_call_id`, `prompt_text`, `contract_id`,
`idempotency_key`, `counterparty_agent_id`, `task_domain`, `hal_score`, and
`hallucination_caught`. My candidate list did not contain a single one of the
plausible ones.

**The docs being thin is not evidence about the schema.** Six sprints of
"NOT CHECKED: needs the DB" would have been answered by one read-only query, and
I did not try it because a prompt three hours earlier said the tools were absent.

### Correction 2: `flagged` is not a failure

The replay script I committed one commit earlier maps `flagged` as BAD, with a
printed caveat saying CONFIRM THIS BEFORE PUBLISHING. Confirmed, and it was
wrong. Grouping 40,000 rows by outcome and averaging the system's **own**
reputation delta:

| decision_outcome | rows | hallucination_caught | avg repid delta | |
|---|---|---|---|---|
| `vetoed` | 27,351 | 27,060 | **−0.56** | penalty |
| `flagged` | 7,966 | 0 | **0.00** | **neutral — held for review** |
| `clean` | 4,648 | 0 | **+0.30** | reward |

`flagged` carries no penalty at all. Scoring it as a failure would have
mislabelled **21,976 rows** across the full table and depressed every earned
score. Fixed. Also noted: `approved` and `correct` each carry delta **−9.00** —
positive-sounding names on penalties. The enum's labels are not trustworthy;
`delta` and `hallucination_caught` are. `hallucination_caught` is non-null on
every row sampled and agrees with `vetoed` 27,060/27,351, so it is now the
preferred label.

### Q2: still unanswerable, now for a much better reason

Two columns looked like task keys. Both fail:

- **`llm_call_id`** — 19,880 non-null and **19,880 distinct** in a 20,000-row
  sample. Exactly 1:1 with events. It identifies a *call*, not a task shared
  between agents.
- **`prompt_text`** — 19,941 non-null, 11,538 distinct. It repeats, which looks
  promising until you see *what* repeats. Of 22,711 distinct prompts, **78 have
  2+ agents and those 78 hold 17,348 events** — ~222 runs each. They are
  **recurring cron jobs**: 8 `EVERGREEN` prompts over 7,731 events (966 runs
  apiece), 2 `system` prompts over 2,001 events, one of which says "Every 60
  minutes".

Grouping by `prompt_text` pairs agents that answered **at different times about
different underlying data**. Computed anyway, it gives **lift 1.283** over 1,612
co-observations and 62 pairs. **That number is an artefact of the join and must
not be published as the fleet's error correlation.** It is recorded here
specifically so nobody recomputes it and believes it.

The replay script's own header warned against exactly this substitution before
any of it was run, and I still nearly took the number at face value. Writing the
guard down is not the same as being immune to the mistake.

**So: co-failure correlation is NOT computable from `repid_score_events`.**
Nothing in the table expresses "two agents evaluated one task instance." Sprint
Q's conclusion survives; its stated reason does not.

### What this means for Sprints L–P

Unchanged, and still conditional. The panel's value swings from +4.70pp to
−0.85pp depending on where the fleet sits on the correlation axis, and **that
position is still unmeasured** — not because the data is unavailable, but
because the schema does not record which events share a task.

That is now a concrete, cheap ask rather than a vague dependency: **either a
task/decision key on `repid_score_events`, or a join table linking events to
task instances.** Without one, the adaptive gate built in Sprint O has to learn
correlation online from its own panels, which is what it was designed to do —
so nothing is blocked, but nothing can be predicted in advance either.

### Also learned, not acted on

Agents on these recurring prompts are wrong **47–70%** of the time
(`hallucination_caught`). These are self-monitoring cron tasks and adversarial
by design, so this is not a fleet quality benchmark and must not be quoted as
one. It does say the simulator's 0.05–0.15 error rates are nowhere near this
slice of real traffic.

### Evidence

341 assertions unchanged, `tsc` 25, published world untouched. The replay
script's outcome map and task-key candidate list are corrected from measurement,
with the measurements inlined so the reasoning cannot be lost.

### NOT CHECKED

- All figures come from the most recent 20,000–40,000 events by `id`, not the
  full 152,001. Full-table `count(distinct …)` timed out; the sample is recent
  traffic and is not claimed to be representative of history.
- Whether `hallucination_caught` means "this agent hallucinated" or "this agent
  caught someone else's hallucination". Its 99% agreement with `vetoed`, which
  carries the penalty, points at the former — **inferred, not confirmed.**
- The replay's ledger path still has not been run end to end against live data.

---

## Sprint S — the ledger on real data, and a config that would degenerate

Q1 was answerable and is now answered, read-only, from the most recent 60,000
events by `id`. Per-agent counts came from SQL; the scoring was done by the real
`ReputationLedger` at harness defaults, not re-implemented.

### The shrinkage works, and real data shows why it had to exist

Ranked by **raw success rate**, the top of the fleet is:

| rank | agent | rate | n |
|---|---|---|---|
| 1 | e1efdd14 | 100.0% | **2** |
| 2 | 8f37d12e | 100.0% | **2** |
| 3–13 | nine more | 100.0% | **1** |

**Eleven agents are joint-first on a single observation each**, while the agent
with 14,715 observations sits at 22.9%. A naive rate ranking hands the fleet to
twelve one-shot claims.

Through the ledger, those eleven collapse to **5014** — the 5000 prior, with
confidence **0.05**. The 3,176-observation agent at 50.3% earns 5154 at
confidence **0.99**. This is the empirical-Bayes shrinkage doing on real data
exactly what it was built for in Sprint B, and it is the first time any of it
has been checked against something other than the simulator.

### The finding that changes a shipped default

The real evidence distribution looks nothing like the simulator's. Well-evidenced
agents (n > 2,700) earn:

```
5028, 4809, 4785, 4785, 4723, 4711, 4656, 4389, 4379, 2291, 2189, 2141
```

**Nine of the twelve sit within 649 bps of one another** — median pairwise
margin **242 bps**. They are all 43–50% success rates, which is to say they are
statistically indistinguishable from the neutral 5000 prior.

Sprints L–P ran escalation at **`marginFloor: 2000`**. Against this fleet,
**100% of pairwise margins in that cluster fall under the floor.** The policy
would fire on essentially every task and degenerate into "always panel" —
destroying the entire point of screening, which is to pay for a panel only when
the leader is genuinely uncertain. In the simulator it escalated on 88% of tasks
and that already looked high; on real data it would be ~100%.

**The right floor for this fleet is on the order of 200–300 bps, not 2000.** Not
changed here: the default was tuned against the simulator, and re-tuning it
against one read-only sample of recent traffic would repeat the same error in
the other direction. It is flagged as a config that does not survive contact
with the real evidence distribution.

This is the concrete payoff of getting off the simulator. The simulator's pool
spanned true quality 0.35–0.95 and produced wide, well-separated margins. The
real fleet is nine agents effectively tied. No amount of further simulator work
would have surfaced that.

### Why the ledger's top pick is not a defect

The ledger ranks `c2aab664` first — 60% over **n=15**, confidence 0.43 — above
the 3,176-observation agent. That looks wrong and is not. The big-`n` agents sit
at 50.28%, i.e. **5028 against a 5000 prior**: they have almost no signal to
shrink toward. An agent at 60% over 15 observations genuinely is the better bet
on this evidence, and the router's UCB would rank it higher still, which is
correct for exploration. Worth stating because it is the kind of output that
invites a "fix" that would break the mechanism.

### Evidence and caveats

- Read-only throughout. No write, no migration, nothing Sean-gated.
- **The EWMA is order-dependent and aggregate counts have lost their order.**
  Outcomes were interleaved deterministically to match each agent's rate. For a
  stationary agent an EWMA converges to the rate, so this approximates the
  ordered replay; **for an agent whose quality drifted it does not.** This
  validates SHRINKAGE, not recency. An ordered replay is still owed.
- Most recent 60,000 events by `id`, not all 152,001.
- `hallucination_caught` as the wrongness label — inferred, per Sprint R.

341 assertions unchanged, `tsc` 25, published world untouched.

### What is now genuinely open

1. **`marginFloor` 2000 does not survive real data.** Needs re-tuning against an
   ordered, representative sample — not against this one.
2. **Ordered replay** by `created_at`, to exercise the EWMA's recency behaviour
   rather than approximating it.
3. **Co-failure remains uncomputable** (Sprint R): no task key exists.

---

## Sprint T — the ordered replay, which corrects Sprint S

Sprint S validated shrinkage on real data and attached a caveat: *"the EWMA is
order-dependent and aggregate counts have lost their order… this validates
SHRINKAGE, not recency. An ordered replay is still owed."* Paid. **The caveat
was load-bearing — the ordered result materially revises Sprint S's conclusion.**

### Method, with no approximation this time

`alpha = 0.06` means `0.94^150 ≈ 1e-4`, so an agent's EWMA is fully determined by
its last ~150 outcomes and the seeded prior has washed out. So the last 150
events per agent were pulled **in `created_at` order** as a bitstring and fed
through the real `ReputationLedger` in sequence. Nothing was interleaved,
averaged, or re-implemented. Read-only throughout.

### The fleet improved recently, and the lifetime rate hides it

| agent | n | lifetime | last-20 | EWMA earned | drift |
|---|---|---|---|---|---|
| 848da285 | 3,042 | 47.2% | **100%** | 8896 | +4175 |
| 84f2d7de | 3,176 | 50.3% | **100%** | 8740 | +3712 |
| f3ef0bf8 | 3,401 | 43.8% | 95% | 7971 | +3596 |
| d82b2ae5 | 2,947 | 48.1% | 75% | 7257 | +2449 |
| **32e0e809** | **14,715** | **22.9%** | **75%** | **6388** | **+4101** |
| … | | | | | |
| 942860a6 | 2,731 | 21.2% | 40% | 4209 | +2089 |
| 57a2f83a | 14,490 | 21.9% | 20% | 2493 | +308 |

**11 of 12 agents score materially higher on recent evidence than on their
lifetime rate. Mean drift +2419 bps.**

The sharpest case is `32e0e809`: 14,715 observations at a **22.9%** lifetime
rate — second-worst in the fleet — but **75%** over its last 20 and an EWMA
earned score of **6388**, mid-pack. A lifetime average would keep routing away
from an agent that is currently performing fine. This is precisely the failure
the EWMA was chosen to prevent, observed on production data for the first time.

### The correction to Sprint S

Sprint S reported that **100%** of pairwise margins among well-evidenced agents
fall under the shipped `marginFloor: 2000`, and concluded the escalation policy
"would degenerate into always-panel."

Under the correct ordered replay:

| | Sprint S (order destroyed) | Sprint T (ordered) |
|---|---|---|
| earned spread | 2,887 bps | **6,403 bps** |
| median pairwise margin | 242 bps | **1,818 bps** |
| share under `marginFloor: 2000` | **100%** | **56%** |

**Sprint S overstated it.** Interleaving outcomes to match a lifetime rate
compresses every agent toward the prior, which manufactures artificially thin
margins. With real ordering the fleet is genuinely spread out — 6,403 bps
top-to-bottom.

56% is still high, and `marginFloor: 2000` would still escalate on more than
half of all pairs, so the direction of Sprint S's concern stands. **Its
magnitude does not, and the headline claim was wrong.** Recorded as a
correction, not quietly amended.

`marginFloor` is still not changed. The evidence has moved from "certainly
degenerate" to "probably too permissive", and one recent sample is not grounds
for retuning a default.

### What this says about the method

The order-destroying approximation was flagged as a limitation at the time it
was used, and the limitation is exactly what produced the wrong number. That is
the process working — but it is also the third time in this session a result had
to be walked back after a caveat I had written myself turned out to matter. The
lesson is not "write better caveats". It is that **a caveat is a debt, and a
published number carrying one should be treated as provisional until it is
paid.** Sprint S's table should not have been stated as flatly as it was.

### Evidence and caveats

- Read-only. No write, no migration, nothing Sean-gated.
- Tail of 150 events per agent, drawn from the most recent 60,000 by `id`.
- **The improvement may be systemic rather than per-agent.** Nearly every agent
  ends on a run of successes *simultaneously*, which looks more like a fix
  landing or a change in task mix than twelve agents independently improving.
  Not investigated. If it is a task-mix change, the drift measures the workload,
  not the agents — the same confound class as Sprint L's `--hardness` work.
- `hallucination_caught` as the wrongness label remains inferred (Sprint R).

341 assertions unchanged, `tsc` 25, published world untouched.

---

## Sprint U — resolving a chain of two wrong answers

Sprint T flagged a confound and did not resolve it: *"nearly every agent ends on
a run of successes simultaneously, which looks more like a fix landing or a
task-mix change… If it is task mix, the drift measures the workload, not the
agents."* Investigated. **It is task mix, and it invalidates Sprint T's
headline.**

### The contamination

The 60,000-event slice, selected by `id desc`, spans 2026-06-15 to 2026-08-13.
Split at Aug 5:

| | events | success rate | cron share |
|---|---|---|---|
| since Aug 5 | **57** | **0.930** | **0.000** |
| before Aug 5 | 59,943 | 0.338 | 0.379 |

**`id` order and `created_at` order are not aligned.** The recent tail is 57
events of an entirely different character — no cron jobs, 93% success — sitting
on top of 59,943 older events at 33.8% dominated by recurring cron traffic.

With `alpha = 0.06` the EWMA's effective window is ~17 outcomes, so those 57
events **dominate every agent's final score**. Sprint T's "+2419 bps mean drift,
11 of 12 agents improved" measures a workload change, not agent improvement. The
trailing runs of 1s were the artefact, exactly as suspected and not checked.

### Three answers to one question

The margin question has now been answered three times:

| sprint | method | share of pairs under `marginFloor: 2000` |
|---|---|---|
| S | order destroyed (interleaved to match lifetime rate) | **100%** ✗ |
| T | ordered, all domains — tail contaminated by the 57 | **56%** ✗ |
| **U** | **ordered AND constant task mix (cron-only)** | **91%** |

Sprint S was directionally right for the wrong reason. Sprint T's correction was
itself wrong. **Both published numbers were unsound, and neither should have
been stated as flatly as it was.**

### The sound measurement

Restricting to `EVERGREEN` + `cait` (recurring cron, a homogeneous mix), last
150 events per agent in `created_at` order, through the real ledger:

```
spread 2704 bps    median pairwise margin 870 bps
under marginFloor  500: 29%      1000: 56%      2000: 91%
```

**`marginFloor: 2000` escalates on 91% of pairs.** Sprint S's concern was
correct and its number was not: the policy is far too permissive for this fleet,
though "91%" is not "100%" and the fix is a floor near **500 bps**, which would
escalate on 29%.

Still not changed. This is one domain slice of one sample, and the whole point
of the last three sprints is that this fleet's numbers move a lot depending on
how you cut them.

### A finding worth more than the margin number

`32e0e809` has a **22.9% lifetime success rate over 14,715 events** — near-worst
in the fleet. On cron work only, where it has 500 events, it scores **66.7%,
the best of any agent**, earning 7327.

Its poor global reputation comes entirely from non-cron work. **Agent quality
here is domain-dependent, and the ledger is global.** A single earned score per
agent averages across task types the agent is differently good at, and will
route cron work away from the fleet's best cron performer.

Per-domain reputation is not built and is not a small change — `ReputationLedger`
keys on agent id alone. Flagging it, not starting it: it is the same class of
architectural decision as sub-task routing granularity, which was deferred to
Sean on 2026-08-13.

### The pattern, stated plainly

Three sprints, three numbers, two retractions. Each error came from a
transformation that seemed harmless: interleaving to recover an order, then
trusting `id` as a proxy for time. **Both were assumptions about data shape made
without checking the data.** The corrective is not more caveats — it is checking
the shape first, which in both cases was one cheap query.

### Evidence and caveats

- Read-only throughout. No write, no migration, nothing Sean-gated.
- Cron-only means this measures the fleet on **recurring self-monitoring tasks**,
  which are adversarial by design and not the production mix. It is the right
  slice for comparing agents to each other, and the wrong one for predicting
  production behaviour.
- 11 agents; `32e0e809` and `57a2f83a` have only ~500 cron events each against
  ~14,500 total, so their cron scores rest on far less evidence than the others'.
- `hallucination_caught` as the wrongness label remains inferred (Sprint R).

341 assertions unchanged, `tsc` 25, published world untouched.

---

## Sprint V — pricing per-domain reputation before building it, and a third correction

Sprint U found agent quality to be domain-dependent and flagged per-domain
reputation as architecturally significant. Sprint L's rule says **measure the
prize before building.** Measured — with a clean method this time: a plain
group-by over the 60,000-event slice, `n >= 150` per cell, no windowing, no tail
selection.

### Correction to Sprint U: 32e0e809 is NOT the best cron performer

Sprint U reported that `32e0e809` — 22.9% globally, near-worst — scored **66.7%
on cron, the best of any agent**, and drew a conclusion from it. The full-slice
per-domain rates say the opposite: it ranks **11th of 11 on cait (0.416)** and
**10th of 11 on EVERGREEN (0.396)**.

The error is in Sprint U's method, not the data. It took each agent's **last 150
cron events**. `32e0e809` has ~467 cron events, so its tail-150 reaches back
across a third of its history; agents with ~4,500 cron events have a tail-150
covering 3% of a much shorter, more recent window. **The tail-150 windows span
different time periods per agent, so the scores were never comparable.**
"Constant task mix" fixed one confound and left an unaligned-time confound in
place.

That is three consecutive sprints where an ad-hoc slice produced a number that
did not survive the next check. **The common cause is not any one bug: it is
computing on a convenience sample and reporting it as a property of the fleet.**
This sprint's group-by has no window, no ordering and no tail, which is why it
is the first of the four that has nothing left to retract.

### The fleet is two disjoint pools, not one

`peer_verify` is ~30,600 events at ~21% success, worked by exactly three agents
— `32e0e809`, `57a2f83a`, `942860a6` — and **no other agent touches it**. Those
three are also barely present anywhere else.

So the three agents with terrible global scores are not bad agents. They work a
domain where **everyone** scores 21%, and they are never in competition with the
other nine. A global earned score ranks across two pools the router never
actually chooses between, which makes the comparison meaningless in both
directions.

### The prize, priced

Rank by domain (1 = best) among the nine overlapping agents:

| agent | cait | EVERGREEN | review | system |
|---|---|---|---|---|
| 84f2d7de | 6 | **1** | **9** | 7 |
| 065ad782 | 4 | 7 | **1** | 8 |
| 848da285 | 7 | 6 | 2 | **1** |
| 9c0dc740 | **1** | 5 | 3 | 5 |

**Ranks genuinely scramble** — `84f2d7de` is first on EVERGREEN and last on
review. Domain-dependence is real.

But the prize is not proportional to the drama:

| domain | best-by-domain | global pick scores | gain |
|---|---|---|---|
| cait | 9c0dc740 48.9% | d82b2ae5 47.2% | +1.70pp |
| EVERGREEN | 84f2d7de 51.5% | d82b2ae5 51.3% | +0.20pp |
| review | 065ad782 51.4% | d82b2ae5 46.1% | +5.30pp |
| system | 848da285 42.4% | d82b2ae5 38.1% | +4.30pp |

**Volume-weighted: +1.64pp.** The two high-volume domains have the smallest
gains (+1.70, +0.20); the large gains sit in low-volume domains. So the
headline-grabbing +5.30pp on `review` is worth very little in aggregate.

### Recommendation: do not build it yet

**+1.64pp** against a change that reshapes `ReputationLedger`'s key from agent to
(agent, domain), touches persistence, the router, and the store's unapplied
migration. For comparison, escalated aggregation measured **+4.70pp** in the
simulator for an additive module that changed nothing existing.

The cheap version captures most of it: the `peer_verify` pool is disjoint, so
simply **not ranking those three agents against the other nine** removes the
largest distortion without any per-domain machinery. That is a filter, not an
architecture change.

Still Sean's call, and still not started.

### Evidence and caveats

- Read-only. No write, no migration, nothing Sean-gated.
- One 60,000-event slice; cells with `n >= 150`. Domains below that threshold
  (`general`, `heal`, `verification`) are excluded and unmeasured.
- `general` shows two agents at **1.000** over 165–174 events. Not investigated;
  a domain where everything succeeds is more likely a labelling artefact than a
  real one, and it is excluded from the volume-weighted figure by the same
  threshold that excludes the rest.
- `hallucination_caught` as the wrongness label remains inferred (Sprint R).

341 assertions unchanged, `tsc` 25, published world untouched.

---

## Sprint W — consolidating the record, because four numbers were retracted

No new measurement. Sprints S–V produced four numbers that later sprints
retracted, and the corrections were scattered across four log entries. A reader
arriving at `SPRINT-LOG.md` would have found **four different answers to the
margin question** with no way to tell which survived. That is a worse failure
than any individual wrong number, because a wrong number that is clearly
superseded costs nothing and one that must be reconstructed from a chain of
partial corrections costs an afternoon.

### Done

- **`docs/TRUST-HARNESS.md` gains a "What REAL data says" section.** It had
  **zero** mentions of real data — the authoritative document still described a
  simulator-only world after five sprints of production measurement. The new
  section states what is confirmed, what is not answerable, and carries an
  explicit **do-not-cite table** of the four retracted claims with the reason
  each failed. It supersedes the per-sprint entries.
- **`scripts/repid-replay.mjs` header corrected.** It still asserted that no
  task-grouping column was "recorded anywhere in this repo" — a claim about the
  DOCS stated as though it were about the TABLE, which Sprint R refuted by
  reading the real schema (37 columns, not 2). The header now says co-failure is
  uncomputable *for the measured reason* rather than for want of documentation.

### The four retractions, in one place

| claim | sprint | why it failed |
|---|---|---|
| 100% of margins under `marginFloor: 2000` | S | outcome order destroyed by interleaving |
| fleet improved, +2419 bps mean drift | T | 57 anomalous non-cron events dominated a 17-event EWMA window |
| 56% of margins under the floor | T | same contamination |
| `32e0e809` best on cron at 66.7% | U | tail-150 windows spanned different time periods per agent |

All three root causes are the same species: **an assumption about the shape of
the data, made without checking the shape.** Interleaving assumed order did not
matter. `id desc` assumed id tracked time. Tail-150 assumed equal volumes meant
equal windows. Each check was one cheap query.

### The rule this adds

The repo's standing rule is *suspect the measurement before the code*. Sprint L
added *suspect the target before either*. This adds the one that would have
prevented all four: **suspect the sample before the measurement**, and treat any
number carrying an unpaid caveat as provisional rather than publishing it flat.

### Evidence

341 assertions, 0 failures. `tsc --noEmit` 25 — unchanged. Validity guard MATCH
(92.3% / 179 / 0.643); the published simulator world is untouched by all of
this. `repid-replay.mjs --dry-run` still exits 2 with no credentials.

### State at the end of this run

**Simulator axis: closed.** Routing 2.00pp from its bound, panel membership
0.75pp from its bound, panel size resolved at 3, whether-to-panel gated
adaptively on measured uplift.

**Real-data axis: open, and now the only one that matters.** Shrinkage confirmed.
The outcome enum is untrustworthy and `hallucination_caught` is the label. The
fleet is two disjoint pools. Domain-aware routing prices at +1.64pp and is not
worth the rekey. Co-failure — the input that decides whether panels ever run —
**cannot be computed until a task key exists.**

Nothing further should be measured from ad-hoc slices of this table. The next
useful step is a schema change (a task key, or a join table), and that is Sean's.

---

## Sprint X — hard-wiring the lessons, and marking PR #24 ready

Two asks: mark the PR ready for review, and make the session's lessons
enforceable so agents stop duplicating work and start reading what others did.

### PR #24 is out of draft

28 commits, 341 assertions, tsc 25, build clean, description already rewritten
to match reality.

### The problem being solved

Advice in a document decays into a file nobody opens. Concretely, this session:

- spent **two full sprints** optimising a component already at **97.9% of its
  theoretical bound**, because nobody had measured the bound;
- published **four numbers** that later sprints had to retract, three of them
  from the same root cause;
- nearly re-cited a retracted figure (lift 1.283) **after writing the warning
  against it myself**.

The last one matters most: the guard existed, in the file being edited, and it
still nearly failed. So the fix cannot be another paragraph.

### What was built

**`docs/PRIOR-WORK-INDEX.md`** — one entry point. A protocol, a table of where
the authoritative answer lives for each question, a **CLOSED** list (with the
measurement that closed each item, so reopening one requires new evidence), an
**OPEN** list naming owners, a **RETRACTED** list, and the four rules that would
have prevented every mistake above.

**`scripts/check-prior-work.mjs`** / `npm run check:prior-work`, wired into
`npm run check`. It enforces the two mechanically checkable invariants:

1. **A retracted number cannot reappear.** Six patterns, specific enough not to
   trip on unrelated digits. Historical files that legitimately record them
   (`SPRINT-LOG.md`, `TRUST-HARNESS.md`, `repid-replay.mjs`) are allowlisted
   **by exact path** — deleting the record would hide the correction, which is
   worse than the original error, but a *new* file inherits no exemption.
2. **No doc may be invisible.** Every `docs/*.md` must be named in the index.

**`CLAUDE.md` gains a FIRST block** pointing at the index, above everything
else, since that file loads automatically for every agent in this repo.

### Verified, not assumed

Passes clean: 249 files scanned, 6 patterns, 11 docs reachable. Then
mutation-tested, because a gate that cannot fail is not a gate:

| violation introduced | result |
|---|---|
| new doc citing +446% / lift 1.283 / +2419 bps | **3 failures**, exit 1 |
| doc added but not indexed | **1 failure**, exit 1, names the file |
| `## RETRACTED` heading removed from the index | **1 failure**, exit 1 ("the index has been gutted") |

All three restored and re-verified clean afterwards.

### What this deliberately does NOT do

**It cannot verify that an agent read the index, and it does not pretend to.**
A check that claims to measure something it cannot is the exact defect this repo
keeps finding. It enforces two mechanical invariants; the rest of the protocol
is honour-system, placed in `CLAUDE.md` where it loads automatically.

The retracted-claim patterns are also a judgement call: too loose and false
positives teach people to skip the gate, which is how a gate dies. They are
tuned narrow, so a sufficiently reworded citation would slip through. That is
the deliberate trade.

### Evidence

341 harness assertions + prior-work VERIFIED, 0 failures. `tsc --noEmit` 25 —
unchanged. `next build` clean. Sim untouched at 92.3% / tau 0.643 / p99 179.

### NOT CHECKED

- Whether the index actually changes agent behaviour. Unmeasurable from here;
  the honest test is whether a future session skips work already on the CLOSED
  list.
- The index is a snapshot like everything else in this repo. It will rot unless
  finishing work includes updating it — which is why the doc-reachability check
  exists, though that catches only missing files, not stale content.

---

## Sprint Y — the index check reaches CI, and a red check that read green for eight sprints

Asked to put the index check in CI. Doing that required first discovering that
`npm run check` did not pass at all, and that one of its members had been
failing since Sprint D while being reported as green — by me, repeatedly.

### The check that was red the whole time

`npm run check:harness-portable` has exited **1 since `1f54a40` (Sprint D)**. The
violation:

```
lib/trustshell/harness/transform.ts: references 'window.', tying the harness to a runtime.
```

The offending line is **English prose in a comment**: *"turns in between are
usually the most disposable thing in the window."* — the word `window` followed
by a full stop, matching the banned `window.` token.

**Why it read as green for eight sprints, which is the part that matters.** My
verification loop was:

```bash
npm run check:$s 2>&1 | grep -oE "[0-9]+ passed, [0-9]+ failed" || echo "portable ok"
```

The portability script printed neither shape — a prose line on success, a
different prose line on failure. The grep matched nothing either way, and the
`||` fallback printed **"portable ok"**. Two outcomes where three were needed,
which is the exact defect `CLAUDE.md` names as this codebase's recurring one,
committed inside the loop meant to catch it. Every "portability holds" in
Sprints K–X was unearned, and the PR body's "portability enforced" was too.

### Both halves fixed

**The false positive.** The checker now strips comments before scanning, with a
quote-aware stripper so `'https://x'` cannot eat the rest of a line and hide a
real violation. A comment cannot tie the harness to a runtime; only code can.
Rewording the prose would have been the wrong fix — a checker that fires on
English gets worked around by editing the English, leaving the real constraint
unenforced while looking green.

**The misreadable output.** It now prints `harness-portability: N passed, M
failed`, the same shape as every other suite, so a runner grepping the common
format cannot fall through to its own default.

Mutation-tested, and the first attempt was **invalid**: the anchor
`export function approximateTokens` does not exist in that file (it is
`export const`), so two mutations silently applied nothing and "passed". Caught
by checking the anchor. Re-run against a real anchor:

| mutation | result |
|---|---|
| `window.innerWidth` in code | 1 failure, exit 1 |
| `process.env` after a URL string literal | 1 failure, exit 1 |
| `require('node:fs')` | 1 failure, exit 1 |
| external import of `@supabase/supabase-js` | 1 failure, exit 1 |

### CI

`.github/workflows/prior-work.yml`. Separate from PR #25's `check.yml` so the
branches do not conflict, with a distinct job name so a failure says which gate
broke.

**It does not run `npm run check`, and the reason is load-bearing.** That
command exits 1 on this branch: its last step is `npx tsc --noEmit` and there
are **25 pre-existing errors**, all in `src/graphs/motor-squad-graph.ts` — a
file importing a package that is not in `package.json` and never has been, which
PR #25 deletes. Gating on it would have landed permanently red, and a gate that
cannot pass gets ignored.

So tsc is gated on **regression, not zero**: fails above 25, the repo's
documented baseline, and emits a `::notice::` if the count drops so the baseline
gets lowered rather than silently drifting back up.

Every step verified locally before commit: prior-work 0, portability 0, nine
suites 0, tsc 25 → would pass.

### NOT CHECKED

- **The workflow has never executed on GitHub.** Locally-green steps are not the
  same as a green run; YAML, `npm ci` on a clean cache, and the runner's Node 20
  are all unverified until it actually runs. Treat the first run as the test.
- Whether PR #25's `check.yml` and this file interact badly once both land. They
  overlap deliberately (that `npm run check` includes `check:prior-work`), but
  the combination has not been observed.
- How many other check scripts print a non-standard shape and could be misread
  the same way. Only the portability one was fixed; the rest were not audited.
