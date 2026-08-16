# HAL detection AUC — the pooled number is a scale artifact

**Headline: pooled AUC 0.4493 [0.4075, 0.4911] is not a measurement of HAL.
Stratified to the only rows where the comparison is defined, AUC is 0.9579
[0.9375, 0.9784].** The pooled figure measures the fact that one `hal_mode`
writes `hal_score` on a 0–100 scale while the others write 0–1.

Measured 2026-08-16 against live `public.hal_runner_results` (1,825 rows) via
the Supabase MCP tools. Every figure below is reproducible from the SQL in §6.

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
`t12-overnight` at 0.9757 (n = 324) and is **NOT EXPLAINED** here. It is the
obvious next question and is left open in §7.

---

## 5. Three incidental findings

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

## 6. Reproduce it

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

## 7. What this does NOT establish

- **Nothing about HAL in production.** This is one offline evaluation table.
  `hal_production_events` (44 columns) was **NOT CHECKED**.
- **The labels themselves were not audited.** `labeled_by` was not examined and
  no label was independently re-derived. If the ground truth is wrong, both the
  pooled and the stratified figure are wrong together.
- **Why `hal_test_cases` scores 0.5940 against `t12-overnight`'s 0.9757 is NOT
  EXPLAINED.** n = 71 is small, but the gap is large enough to matter and could
  mean the strong result is specific to one benchmark's construction. **Until
  that is settled, quote the stratum figure 0.9579 with its composition
  attached, never as "HAL's accuracy" flat.**
- **No threshold or operating point is recommended here.** AUC is
  threshold-free; `hal_threshold` and the veto path were not evaluated.
- **This is not a claim that any published number is wrong**, because none was
  published. See the §1 caveat on attribution.

---

## 8. The gate this suggests, and why it is not built here

The mechanical invariant that would have caught this is narrow and real:
**`hal_score` must not be pooled across `hal_mode` values whose scales differ**,
and more simply, **`mock`-mode scores are on a 0–100 scale and no other mode
is.** A check could assert that `hal_score` stays within a declared per-mode
range and fail when a mode's distribution moves outside it.

It is not built in this change for one honest reason: it requires a live
database, so in CI it would report NOT_CHECKED exactly the way `check:legacy-key`
does, and a gate that cannot run in the gate is close to no gate. Recording it
as a recommendation with its cost stated is better than shipping a green tick
that never executes. **OPEN — owner not assigned.**
