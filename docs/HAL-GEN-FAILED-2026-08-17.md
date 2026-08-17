# `gen_failed` is not a generation failure — and one half of it hides a verdict contradiction that reached the live path

**Measured 2026-08-17** against `hal_runner_results` and `repid_score_events`
(Supabase `qnnpjhlxljtqyigedwkb`). Follow-up to #55 §2, #64 (A21) and #65 (A23).

Chasing a loose end left in #55: *"every one of the 69 failed generations is in
the weak stratum, so 'drop gen_failed' silently reweights the blend."* That is
true. It is also not the interesting part.

**`gen_failed` marks two unrelated things on this benchmark, and neither one is a
generation failure.** One of them is a suppressed verdict whose flag was never
updated — and the same divergence appears on the live scoring path, where it ran
for six weeks.

---

## 1. The 69 are two populations, not one

```
hal_mode='fact-check-s2', benchmark_source='hal_test_cases', gen_failed
```

| `gen_failure_reason` | n | label split | mean `hal_score` | `hal_vetoed` | has answer |
|---|---|---|---|---|---|
| `no provider responded` | **26** | 22 clean / 4 hall. | 0.0091 / 0.0625 | 0 | **26** |
| `Low quorum … downgraded to 'clean'` | **43** | 11 clean / **32 hall.** | 0.5682 / **0.7953** | **43** | 43 |

They share a flag and nothing else. The first is an infrastructure failure; the
second is a **policy decision applied to a successful detection**.

## 2. Neither is a generation failure

Every one of the 69 rows carries `gen_provider = 'corpus'`,
`gen_model = 'labeled-claim'`, `gen_latency_ms = NULL`, and a complete
`generated_answer`:

> *"A Python class decorator accepts a class object as its argument and returns a
> new object, …"*

**There is no generation step on this benchmark.** The answer is read from a
labelled corpus. So `gen_failed` cannot mean what its name says, and
`gen_failure_reason = 'no provider responded'` is describing **HAL's verification
providers**, recorded in a column named for generation.

This matters for the published figure. #55 excludes `gen_failed` with the
rationale *"no answer to judge, and counting those charges HAL for a provider
outage."* Half of that is right — it **is** a provider outage — but there is an
answer, and it has a ground-truth label. The exclusion is defensible; **the
stated reason is not the reason.**

## 3. The 43: three records of one event, and they disagree

The reason string says the verdict was *downgraded to `clean`*. Asked directly:

| `signals.decision` | `hal_vetoed` | `was_caught` | `false_positive` | truth | n |
|---|---|---|---|---|---|
| `clean` | **true** | **true** | false | hallucination | **32** |
| `clean` | **true** | false | **true** | clean | 11 |

- **`signals.decision` says `clean`** — the quorum rule applied.
- **`hal_vetoed` says `true`** — the flag was never updated.
- **`was_caught` / `false_positive` were derived from the flag, not the decision.**

So **32 rows credit HAL with catching a hallucination whose emitted verdict was
`clean`**, and 11 charge it with a false positive for a veto it also withdrew.
`veto_class` is `UNKNOWN` on all 43.

That is this repository's founding defect — *a system reporting success it has
not earned* — inside the ledger built to measure the component built to catch it.

**The reason string is the only honest record of what happened.** Three
structured columns disagree with it, and a query that trusts any of them gets a
different answer.

## 4. What it does to the number: less than you would think

Recomputed with averaged ranks (see §6 for the trap):

| sample | n_pos | n_neg | AUC |
|---|---|---|---|
| A — as published, `gen_failed` excluded | 197 | 198 | **0.9579** |
| B — plus the 43 low-quorum rows | 229 | 209 | **0.9516** |
| C — every scored row | 233 | 231 | **0.9477** |

**A reproduces #55 and #64 exactly**, which is what licenses B and C.

Including the wrongly-excluded 43 moves the headline by **0.0063**. The
measurement is robust; **the bookkeeping is not.** Recording this explicitly so
nobody re-opens the metric on the strength of §3 — the integrity finding and the
accuracy finding point in different directions, and only one of them is large.

## 5. The same divergence reached the live path

`repid_score_events` carries the same pair — `hal_decision` and
`hallucination_caught` — and is live: **152,157 rows, 2026-04-14 to 2026-08-16.**
Per the linkage #55 traced, `hallucination_caught` drives the `integrity`
observation → `veritasCatchRate` (weight 0.30) → tier → daily limit.

**1,585 rows have `hallucination_caught = true` with `hal_decision <> 'vetoed'`**
(1,512 `clean`, 73 `flagged`) — 2.26% of all caught events, across **5 agents**.

The month breakdown is the finding:

| month | divergent | caught | total |
|---|---|---|---|
| 2026-04 | **715** | 717 | 1,415 |
| 2026-05 | **870** | 870 | 40,760 |
| 2026-06 | **0** | 41,745 | 70,415 |
| 2026-07 | 0 | 26,683 | 39,453 |
| 2026-08 | 0 | 5 | 114 |

**In May, 100% of "caught" events were divergent. From June, exactly zero.**
A clean before/after: something was fixed on or about **2026-05-27**, and nothing
in the repo records it.

**NOT ESTABLISHED: whether those 1,585 rows still move current reputation.**
They are historical, and `value` decays toward `PRIOR_VALUE` while `rawValue`
does not (#55 §5). Whether the live rate is computed over a window that still
includes April–May was **NOT CHECKED**. Do not state that current tiers are
affected, and do not state that they are not.

## 6. The trap this measurement walked into, and how it was caught

The first AUC run returned **0.8351** — the exact min-rank artifact #55
identified and retracted.

The cause was subtle: the query averaged `rank()` within tied scores. **That is a
no-op.** `rank()` already assigns every tied row the same value, so averaging
them returns it unchanged. Mid-ranks require averaging `row_number()`.

It was caught only because **0.8351 is a published retraction** — a known-wrong
number acting as a canary. Had the corpus produced any other wrong value, the
error would have shipped. That is an argument for retractions naming their
number, which `PRIOR-WORK-INDEX.md` already does.

## 7. What this closes, and what it does not

**CLOSED — why the 59 no-provider rows have no providers** (open since #65 §8):

- `providers_attempted` is **EMPTY** on all 59, against `groq,gemini,litellm` on
  the 312 normal rows. **No provider was attempted.** Not an outage — the runner
  never tried.
- `signals` carries a full decision record: `ex_veto`, `decision`, `ex_score`,
  `evidence_quality`, `agreement_score`. `hal_score` equals `ex_score` to within
  **0.000027**, and signals/flag agree on all 41 vetoes with **zero
  disagreements**.

So the correct statement is **not** "HAL wrote a score with nothing behind it".
A **secondary `ex_*` scoring path** produces the score and the veto without
consulting a provider, and records that it did so. It is internally consistent
and non-discriminating (AUC 0.5150). **#65 §5 should be read with this
refinement.** The 41 vetoes also carry `veto_class = 'FACTUAL_ERROR'` — a typed
verdict, from a path that consulted nothing.

**STILL OPEN**

- **What changed on 2026-05-27.** Inferred from a clean break in the data, not
  from a commit. No repo artefact names it.
- **Whether the historical 1,585 still affect current scores** — §5.
- **Why the runner takes the `ex_*` path at all** — needs the runner. Still not read.
- **12 rows carry `used:2`** in both `hal_providers_used` and
  `providers_attempted` — a count serialised into a name field, in two columns.
- Labels remain unaudited (unchanged since A21).

## 8. Recommended gates

**Gate A — a data invariant, and it is cheap.** `hallucination_caught = true`
must imply `hal_decision = 'vetoed'`. It holds on every row since 2026-06-01 and
fails on 1,585 before it. As a suite it needs the database, so it reports
NOT_CHECKED without credentials — a real cost, and the reason it is proposed
rather than added here.

**Gate B — offline, and free.** No fixture may carry `gen_failed` without
`gen_failure_reason`. A flag whose meaning lives only in a free-text sibling
column is the defect in §1; a fixture that drops the sibling makes it
unrecoverable. The current export drops it.

**Gate C — the one that would have prevented §3.** A row may not carry a
`decision` and a `vetoed` flag that disagree. This belongs in the runner, beside
the empty-provider refusal proposed in #65 §9 — both are the same rule: *do not
emit a verdict the evidence does not support, and do not record a verdict
different from the one emitted.* Kernel-lane code.

## 9. Reproduction

```sql
-- §1  the two populations
select coalesce(gen_failure_reason,'(null)') reason, count(*) n
from hal_runner_results
where hal_mode='fact-check-s2' and benchmark_source='hal_test_cases' and gen_failed
group by 1 order by n desc;

-- §3  three records, one event
select signals->>'decision' decision, hal_vetoed, was_caught, false_positive,
       ground_truth_is_hallucination is_hall, count(*) n
from hal_runner_results
where hal_mode='fact-check-s2' and benchmark_source='hal_test_cases'
  and gen_failed and gen_failure_reason like 'Low quorum%'
group by 1,2,3,4,5 order by n desc;

-- §5  the live analogue, by month
select date_trunc('month', created_at)::date month,
       count(*) filter (where hallucination_caught and coalesce(hal_decision,'')<>'vetoed') divergent,
       count(*) filter (where hallucination_caught) caught, count(*) total
from repid_score_events group by 1 order by 1;

-- §7  no provider was ATTEMPTED, and the score is the ex_* score
select coalesce(array_to_string(providers_attempted,','),'(empty)') attempted,
       round(avg(abs(hal_score-(signals->>'ex_score')::numeric)),6) mean_abs_diff,
       count(*) n
from hal_runner_results
where hal_mode='fact-check-s2' and ground_truth_is_hallucination is not null
  and hal_score is not null and not gen_failed
  and coalesce(array_to_string(hal_providers_used,','),'')=''
group by 1;
```

**AUC must average `row_number()` within ties, never `rank()`** — §6.
