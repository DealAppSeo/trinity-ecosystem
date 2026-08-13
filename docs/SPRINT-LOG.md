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
