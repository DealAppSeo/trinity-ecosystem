# HAL detection AUC — the pooled number is a scale artifact

**Headline: pooled AUC 0.4493 [0.4075, 0.4911] is not a measurement of HAL. On
the rows where HAL actually executed, AUC is 0.9746 [0.9574, 0.9917].** The
pooled figure measures the fact that one `hal_mode` writes `hal_score` on a
0–100 scale while the others write 0–1.

Two filters are needed and they are independent. §2 removes the scale mismatch;
**§5 removes 59 rows on which HAL called no verification provider at all** and
still emitted a score — and, on 41 of them, a veto.

| sample | n_pos | n_neg | AUC | 95% CI |
|---|---|---|---|---|
| pooled across `hal_mode` | 197 | 1361 | 0.4493 | [0.4075, 0.4911] |
| `fact-check-s2` stratum (§4) | 197 | 198 | 0.9579 | [0.9375, 0.9784] |
| **…and HAL actually ran (§5)** | **169** | **167** | **0.9746** | **[0.9574, 0.9917]** |
| …and HAL did **not** run | 28 | 31 | 0.5150 | [0.3662, 0.6637] |

Measured 2026-08-16 against live `public.hal_runner_results` (1,825 rows) via
the Supabase MCP tools. Every figure is reproducible from the SQL in §7.

**Quote the 0.9746 line, with "on rows where HAL executed" attached.** The
0.9579 in §4 is correct for what it says and is superseded as the headline: it
silently includes 59 rows on which the detector never ran.

---

## 1. Why this was written

A sibling lane was computing "HAL detection accuracy from 1,825 labeled rows;
AUC = 0.46" and had not yet published it. An AUC below 0.5 is the single most
suspicious shape a detector metric can take — it says the score is *reliably
anti-predictive*, which is a much stronger claim than "it doesn't work" and is
far more often a defect in the sample than in the detector.

**This document does not dispute a published finding.** It re-derives the number
independently, finds the pooled form indefensible, and states the stratified one.

**Caveat, stated because it is a debt:** the sibling lane's exact query was not
read — its sample was inferred from a one-line status summary. The pooled
variants in §3 bracket 0.46, so the shape is near-certain, but the attribution
is not VERIFIED. The pooled-vs-stratified gap is measured regardless of what
anyone else computed.

---

## 2. The mechanism, in one table

```sql
select hal_mode, count(*) n, count(*) filter (where ground_truth_is_hallucination) n_pos,
       min(hal_score), percentile_cont(0.5) within group (order by hal_score) med, max(hal_score)
from hal_runner_results
where ground_truth_is_hallucination is not null and hal_score is not null and not gen_failed
group by 1;
```

| `hal_mode` | rows | **positives** | `hal_score` min | median | max |
|---|---|---|---|---|---|
| `fact-check-s2` | 395 | **197** | 0.000 | 0.264 | 1.000 |
| `real` | 510 | **0** | 0.256 | 0.354 | 0.419 |
| `mock` | 653 | **0** | **50.055** | **70.503** | **89.986** |

Two facts collide:

1. **Every labelled hallucination is in `fact-check-s2`.** `real` and `mock`
   contribute 1,163 negatives and **zero** positives.
2. **`mock` is on a different scale.** Its *minimum* is 50.055; the entire
   `fact-check-s2` range is 0–1.

AUC is the probability that a random positive outranks a random negative. Pool
these and 653 mock negatives outrank **every** positive by construction, before
HAL's behaviour is consulted at all. The pooled statistic is answering *"do
mock-mode rows score higher than fact-check rows?"* — yes, they do, by
definition of the scale — and not *"does HAL detect hallucinations?"*

`real` mode adds a second, milder version of the same problem: 510 negatives in
a narrow band (0.256–0.419) that sits above the `fact-check-s2` median of 0.264.

---

## 3. The pooled number is also unstable across sample definitions

Before stratification is even considered, the pooled figure moves across the
chance line depending on how three ambiguous groups are handled — 115 rows with
a null `hal_score`, 266 rows with `gen_failed = true`, and 1 row with a null
label.

| sample | n_pos | n_neg | AUC | 95% CI (Hanley–McNeil) | vs chance |
|---|---|---|---|---|---|
| A — all labelled rows, null score → 0 | 233 | 1591 | 0.5206 | [0.4805, 0.5607] | INDISTINGUISHABLE |
| B — scored rows only | 233 | 1476 | 0.4839 | [0.4444, 0.5235] | INDISTINGUISHABLE |
| C — scored **and** generation succeeded | 197 | 1361 | **0.4493** | [0.4075, 0.4911] | **below chance** |

Only variant C separates from 0.5, and it is the *cleanest-looking* filter —
which is how it earns the reader's trust. Three variants were tried, not twenty,
and each was chosen by a structural property of the data (null score, failed
generation) rather than by searching for a result.

**A quantity whose sign depends on which defensible filter you pick is not yet a
measurement.** That is the tell that should have stopped the pooled number
regardless of the stratification issue below.

---

## 4. Stratified — the defensible measurement

Restricted to `hal_mode = 'fact-check-s2'`, the one stratum containing both
classes:

| stratum | n_pos | n_neg | AUC | 95% CI |
|---|---|---|---|---|
| **`fact-check-s2`** | **197** | **198** | **0.9579** | **[0.9375, 0.9784]** |
| └ `benchmark_source = t12-overnight-2026-06` | 162 | 162 | 0.9757 | — |
| └ `benchmark_source = hal_test_cases` | 35 | 36 | 0.5940 | — |

The stratum is near-balanced (197/198), which is itself evidence it was built as
an evaluation set rather than assembled by accident.

**HAL is not anti-predictive. On the rows where the question is well-posed it is
a strong detector**, and the CI clears 0.5 by a wide margin.

The `hal_test_cases` sub-stratum at 0.5940 (n = 71) is materially weaker than
`t12-overnight` at 0.9757 (n = 324). **That gap is EXPLAINED in §5** — it was
recorded as NOT EXPLAINED when this document was first published, and the
explanation moves the headline.

---

## 5. Why the sub-strata differ — 83% of one benchmark ran with no provider

**Investigated 2026-08-16, same session, after publication. The gap is not
benchmark difficulty, engine version, threshold, or noise. In 59 of the 71
`hal_test_cases` rows, `hal_providers_used` is EMPTY — HAL called no
verification provider — and it emitted a `hal_score` anyway.**

### 5.1 The gap is real before it is explained

Both sub-strata carry the same `gen_provider` (`corpus`), the same `gen_model`
(`labeled-claim`) and the same `hal_threshold` (0.43), so it is not a config
difference. And it is not sample noise — the intervals do not overlap:

| sub-stratum | n_pos | n_neg | AUC | 95% CI |
|---|---|---|---|---|
| `hal_test_cases` | 35 | 36 | 0.5940 | [0.4616, 0.7265] |
| `t12-overnight-2026-06` | 162 | 162 | 0.9757 | [0.9586, 0.9928] |

`hal_test_cases`'s interval **contains 0.5** — on its own it is indistinguishable
from chance — while `t12-overnight`'s lower bound is 0.9586. 0.7265 < 0.9586, so
the two do not overlap.

### 5.2 The score distributions differ in kind, not degree

| sub-stratum | class | median | distinct scores |
|---|---|---|---|
| `t12-overnight` | negative | 0.0000 | 7 |
| `t12-overnight` | positive | 0.9875 | 8 |
| `hal_test_cases` | negative | 0.2567 | 24 |
| `hal_test_cases` | positive | 0.2781 | 30 |

`t12-overnight` is near-binary and near-separated. `hal_test_cases` is a narrow
unimodal blob with both classes centred at ~0.26 — **a separation of 0.0074
between class medians.** That is not a weak detector; it is the shape of a value
that does not depend on the input.

### 5.3 The cause

```sql
select benchmark_source,
       coalesce(nullif(array_to_string(hal_providers_used,','),''),'(EMPTY)') providers,
       count(*), avg(hal_latency_ms), count(*) filter (where hal_vetoed)
from hal_runner_results
where hal_mode='fact-check-s2' and ground_truth_is_hallucination is not null
  and hal_score is not null and not gen_failed
group by 1,2;
```

| `benchmark_source` | providers | n | mean `hal_latency_ms` | vetoed |
|---|---|---|---|---|
| `hal_test_cases` | **(EMPTY)** | **59** | **947** | **41** |
| `hal_test_cases` | `used:2` | 12 | 3864 | 6 |
| `t12-overnight` | `litellm` | 312 | 3135 | 152 |
| `t12-overnight` | `gemini,litellm` | 9 | 3333 | 6 |
| `t12-overnight` | `groq,litellm` | 2 | 2410 | 1 |
| `t12-overnight` | `groq,gemini,litellm` | 1 | 1933 | 1 |

**All 59 empty-provider rows are in `hal_test_cases`; `t12-overnight` has none.**
Latency corroborates: 947 ms against ~3,100 ms when a provider is called — the
empty rows took roughly a third of the time, consistent with a short-circuit.

Split the whole stratum on that one column and the sub-stratum question
dissolves:

| stratum | n_pos | n_neg | AUC | 95% CI |
|---|---|---|---|---|
| **HAL ran (≥1 provider)** | **169** | **167** | **0.9746** | **[0.9574, 0.9917]** |
| HAL did **not** run (empty) | 28 | 31 | 0.5150 | [0.3662, 0.6637] |

The no-provider rows sit at chance, as they must — the score cannot depend on
evidence that was never gathered. Where HAL ran, AUC is 0.9746 **regardless of
which benchmark the row came from**. `benchmark_source` was a proxy; the real
variable is whether the detector executed.

### 5.4 The part that is not a measurement problem

**41 of the 59 no-provider rows are `hal_vetoed = true`.** HAL emitted a veto —
an actionable verdict — on rows where it called no verification provider. Being
counted in an accuracy denominator is the *lesser* issue; the verdict itself was
unearned. This is the defect class the repo's own `CLAUDE.md` opens with, found
inside the component built to catch it.

### 5.5 The same 41 rows were independently read as a *capability*

**Cross-checked 2026-08-16 against PR #55**, where the grok-code lane measured
HAL's accuracy independently and reached the same stratification, the same
AUC 0.9579, and the same tie-handling correction — and built the stronger
artefact, a `PooledModes` refusal in `lib/hal/accuracy.ts` rather than this
document's recommendation. One line there needs this section:

> *"HAL's veto is not a threshold: 41 rows vetoed below 0.43, zero above it
> escaping."*

True, and the cause is not a second veto mechanism. **Those 41 are exactly the
no-provider rows.** The partition is exact:

| | vetoes **below** 0.43 | vetoes **at/above** 0.43 | rows |
|---|---|---|---|
| **EMPTY providers** | **41** | 0 | 59 |
| provider(s) called | **0** | 166 | 336 |

Every sub-threshold veto came from a row with no provider; every provider-called
row was vetoed only at threshold.

Split those 41 by label and the "extra veto path" evaporates:

- **19** fired on hallucinations — 19 of 28 positives, a **67.9%** veto rate
- **22** fired on clean answers — 22 of 31 negatives, a **71.0%** veto rate

**It fires slightly more often on clean answers than on hallucinations**, which
is what AUC 0.5150 on this group predicts. Crediting it with lifting recall from
0.807 to 0.904 is buying recall with 41 coin flips.

**What survives, stated because a correction that overreaches is worth less than
one that doesn't:** the ceiling conclusion in #55 holds. Removing the 41 drops
realized F1 to the pure cut, 0.8760 against a best-possible 0.890547 — 98.37% of
the bound rather than 98.95%. The number moves; the decision that re-cutting the
threshold is not where the value lies does not. And AUC 0.9579 is threshold-free
and veto-free, so it is untouched — indeed it is *conservative*, because it pools
the 59 no-run rows in.

### 5.6 What is still not known

**NOT CHECKED: whether this reaches production.** `hal_production_events` holds
**5 rows**, dated 2026-04-16 to 2026-04-25, and has an entirely different schema
with no provider column — so it cannot answer the question either way. That the
production table is effectively empty is itself worth knowing before anyone
quotes "HAL in production".

Also flagged, unresolved: 12 rows carry the literal string **`used:2`** in
`hal_providers_used`, where every other row carries provider names. A count
written into a name field is a bug somewhere in the writer, and it means
"non-empty" is not the same as "names a real provider". Those 12 rows are inside
the 0.9746 figure. **OPEN.**

---

## 6. Three incidental findings

- **"1,825 labelled rows" is not a labelled set.** 1,825 is the row count of
  `hal_runner_results`. `hal_ground_truth_labels` holds **1,579**. The gap is 245
  rows carrying only the inline `ground_truth_is_hallucination` column, plus one
  row with no label at all.
- **The two label sources agree perfectly.** Cross-tabulating inline label
  against `hal_ground_truth_labels.is_hallucination` yields 1,346 false/false,
  233 true/true, 245 false/null, 1 null/null — **no disagreement in either
  direction**. That is worth recording precisely because it is the failure this
  check was looking for and did not find.
- **Nine `benchmark_source` values are named `CONTAMINATED-*`** (~90 rows). They
  are all in `real`/`mock`, so they never enter the valid stratum — but they are
  pooled into the 0.4493. A row whose own name says it is contaminated should
  not be inside a headline denominator.

`hal_classifications` is a separate table (147,704 rows) and is **not** the basis
of this measurement. Note in passing that its `confidence` column is `text` and
effectively constant — 147,699 of 147,704 rows are `'high'` — so it cannot carry
an AUC at all. Any future accuracy work should not reach for it.

---

## 7. Reproduce it

Pooled variants with Hanley–McNeil intervals, and the stratified figure:

```sql
with base as (
  select hal_score, ground_truth_is_hallucination y, gen_failed
  from hal_runner_results where ground_truth_is_hallucination is not null
),
variants as (
  select 'A' v, coalesce(hal_score,0) s, y from base
  union all select 'B', hal_score, y from base where hal_score is not null
  union all select 'C', hal_score, y from base where hal_score is not null and not gen_failed
),
ranked as (
  select v, y, rank() over (partition by v order by s) r_min,
         count(*) over (partition by v, s) tie_n
  from variants
),
a as (
  select v, (count(*) filter (where y))::numeric np, (count(*) filter (where not y))::numeric nn,
    ((sum(r_min + (tie_n-1)/2.0) filter (where y))
      - (count(*) filter (where y))*((count(*) filter (where y))+1)/2.0)
    / nullif((count(*) filter (where y))::numeric*(count(*) filter (where not y)),0) auc
  from ranked group by v
)
select v, np::int, nn::int, round(auc,4) auc,
  round(auc - 1.96*sqrt((auc*(1-auc) + (np-1)*(auc/(2-auc)-auc*auc)
       + (nn-1)*(2*auc*auc/(1+auc)-auc*auc))/(np*nn)),4) ci_lo,
  round(auc + 1.96*sqrt((auc*(1-auc) + (np-1)*(auc/(2-auc)-auc*auc)
       + (nn-1)*(2*auc*auc/(1+auc)-auc*auc))/(np*nn)),4) ci_hi
from a order by v;
```

Add `and hal_mode = 'fact-check-s2'` to `base` for the stratified figure.

**Tie handling is load-bearing.** `hal_score` has 730 distinct values over 1,710
scored rows, so ties are common; ranks must be averaged within ties
(`r_min + (tie_n-1)/2`). An implementation that breaks ties arbitrarily will
report a different number, and a near-constant score with naive tie handling
produces an AUC just below 0.5 on its own — a second, independent route to the
same wrong conclusion.

---

## 8. What this does NOT establish

- **Nothing about HAL in production.** This is one offline evaluation table.
  `hal_production_events` was checked only for whether it could answer §5.4 and
  it cannot: **5 rows**, 2026-04-16 to 2026-04-25, different schema, no provider
  column. Whether the no-provider path reaches production is **NOT CHECKED**,
  and this table cannot establish it either way.
- **The labels themselves were not audited.** `labeled_by` was not examined and
  no label was independently re-derived. If the ground truth is wrong, every
  figure here is wrong together.
- **Why the no-provider runs happened is NOT ESTABLISHED.** §5 shows *that* 59
  rows executed with no provider and what it did to the metric. Whether the
  cause was provider outage, missing credentials, a deliberate offline mode, or
  a bug is **not determined here** — it needs the runner code, not the table.
  `hal_diagnostics` and `signals` (both `jsonb`) were **NOT READ**.
- **The 12 `used:2` rows are inside the 0.9746 figure.** Non-empty is not the
  same as "named a real provider", so the executed-stratum count of 169/167 is
  an upper bound on rows that provably called a provider.
- **No threshold or operating point is recommended here.** AUC is
  threshold-free. Note this is a live gap: 41 vetoes fired on no-provider rows,
  and the veto path itself was **not evaluated**.
- **This is not a claim that any published number is wrong**, because none was
  published. See the §1 caveat on attribution.

---

## 9. The gate this suggests, and why it is not built here

Two invariants, and the second is the one that matters.

**Gate 1 — scale.** `hal_score` must not be pooled across `hal_mode` values whose
scales differ; `mock` writes 0–100 and no other mode does. A check could assert
`hal_score` stays inside a declared per-mode range.

**Gate 2 — a verdict requires evidence.** *A row with an empty
`hal_providers_used` must not carry a `hal_score`, must not set `hal_vetoed`, and
must never enter an accuracy denominator.* 41 rows violate the middle clause
today. This one is worth more than Gate 1: Gate 1 protects a metric, Gate 2
protects a **verdict**, and it is enforceable at the point of writing rather than
only at analysis time.

Gate 2 also has a form that needs no database and therefore no NOT_CHECKED: the
runner can refuse to emit a score when the provider list is empty, and a unit
test can hold it. **That is the recommended fix and it belongs to whoever owns
the runner** — it is Kernel-lane code, not a Verify-lane change, which is why it
is written down here rather than implemented.

Neither gate is built in this change. Gate 1 as a data check needs a live
database, so in CI it would report NOT_CHECKED exactly the way `check:legacy-key`
does, and a gate that cannot run in the gate is close to no gate. Recording both
with their costs stated is better than shipping a green tick that never
executes. **OPEN — owner not assigned.**
