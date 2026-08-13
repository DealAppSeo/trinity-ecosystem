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
