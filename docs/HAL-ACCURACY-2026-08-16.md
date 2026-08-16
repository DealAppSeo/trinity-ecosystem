# HAL accuracy — measured for the first time, and the trap that hides it

**Date:** 2026-08-16
**Corpus:** `hal_runner_results` @ Supabase `qnnpjhlxljtqyigedwkb`, 1,709 scored
rows exported to `lib/hal/fixtures/runner-results-2026-08-16.json`
**Guard:** `npm run check:hal-accuracy` — 14 assertions, 4 mutations

---

## 0. The finding, in one paragraph

**HAL's detection accuracy had never been measured here.** The index carried
HAL's *outage* (fleet down since 2026-07-17, Sean-owned) and HAL's *scoring
band*, and no entry anywhere stated a precision, a recall or an AUC. The data to
compute all three had been sitting in `hal_runner_results` since 2026-05-05.
Measured: **AUC 0.9579**, realized **F1 0.8812**, against a best-possible
**0.8905** — HAL is at **98.95% of the ceiling any threshold on this score can
reach**. The threshold is not where the remaining win is.

---

## 1. The trap: three score scales stacked in one table

`hal_runner_results` holds three `hal_mode` populations whose `hal_score` means a
**different thing in each**:

| `hal_mode` | rows | labelled hallucinations | score range |
|---|---|---|---|
| `mock` | 653 | **0** | 50.05 – 89.99 |
| `real` | 592 | **0** | 0.26 – 0.42 |
| `fact-check-s2` | 464 | **233 — all of them** | 0.00 – 1.00 |

The ranges **do not overlap**. Every `mock` score outranks every real detection.
So a `select … from hal_runner_results` with no mode filter reports:

```
pooled AUC = 0.484        ← worse than chance
```

and the reader concludes the detector is broken. Within its own mode the *same
score* reports **0.958**. The pooled figure is an artifact of stacking a 50–90
scale carrying no positives on top of a 0–1 scale carrying all of them.

This is the exact failure LESSONS records for real data — an assumption about
the **shape** of a sample, made without checking it. So it is not a caveat in a
comment: `lib/hal/accuracy.ts` **throws `PooledModes`** from every entry point,
and a mutation that removes the refusal is registered and caught.

---

## 2. A number this document had to correct before publishing

The first AUC computed here was **0.8351**, from SQL:

```sql
(sum(rank()) filter (where t) - p*(p+1)/2) / (p*n)
```

That is wrong. The Mann–Whitney statistic needs **average** ranks for ties;
Postgres `rank()` gives **min** rank. This corpus piles scores on exactly 0.0 and
1.0, so the error is large: **0.8351 reported, 0.9579 true.**

Caught before it reached a document, by recomputing pairwise in TypeScript and
disagreeing with the SQL. Both the tie rule and the corrected figure are pinned
in `check:hal-accuracy`, and the mutation that gives ties full credit is
registered — so neither drifts back.

**Do not cite 0.8351.** It is an artifact of the rank function, not a property of
HAL.

---

## 3. What HAL actually scores

On `fact-check-s2`, excluding 69 rows where **generation failed** (there was no
answer to judge — counting those charges HAL for a provider outage): **395 rows,
197 hallucinations, 198 clean.**

| configuration | F1 | precision | recall | tp / fp / fn |
|---|---|---|---|---|
| pure cut @ 0.43 (the live threshold) | 0.8760 | 0.958 | 0.807 | 159 / 7 / 38 |
| **live: 0.43 + extra veto paths** | **0.8812** | 0.860 | 0.904 | 178 / 29 / 19 |
| best possible cut @ 0.2554 | 0.8905 | 0.873 | 0.909 | 179 / 26 / 18 |

**AUC 0.9579.**

### HAL's veto is not a threshold

41 rows are vetoed **below** 0.43, and **zero** rows above 0.43 escape. So the
threshold is a hard floor with additional signals firing under it, and the
realized F1 is *not* `confusionAt(0.43)`. Those extra paths trade precision
(0.958 → 0.860) for recall (0.807 → 0.904) and come out ahead. Anyone modelling
HAL as a single cut will mispredict it; an assertion pins the difference.

---

## 4. The ceiling — and why it closes the threshold question

```
realized F1        0.881188
best possible F1   0.890547   (any threshold on this score, this corpus)
absolute gain      0.009359
fraction of ceiling  98.95%
```

The standing rule is to compute the bound **before** optimising toward it: two
sprints were once spent on a component already at 97.9% of its bound. HAL is at
98.95%. **Re-cutting the threshold cannot buy more than one point of F1**, and
buys it by giving up precision on a path that vetoes real answers.

Improving HAL therefore means improving the **score**, the **corpus**, or the
**failure classes** — not the cut. Concretely:

- **AUC 0.9579 is the constraint.** No threshold beats the ranking it implies.
- **The corpus is 395 usable rows from 2 benchmark sources**, all generated
  2026-05-05 → 2026-06-24. Nothing since the cliff.
- **A named blindspot already exists** — see §5.

---

## 5. Leads, explicitly not results

### `v_hal_numeric_date_blindspot` — 16 rows

Carries `ground_truth`, `hal_verdict`, and a **`proposed_verdict`**. The proposal
converts **2 FN → TP with no new false positives** on that slice. Sixteen rows is
a lead, not a result, and the proposal is *not* simply "risk_flagged → veto":
6 rows carry `risk_flagged = true` on correct answers and the proposal correctly
leaves them PASS.

**⚠ POLARITY INVERSION.** In this view `ground_truth = true` means *the answer is
correct* (PASS + true is scored TN). In `hal_runner_results` the column is
`ground_truth_is_hallucination` — the **opposite** sense. Two HAL tables, two
meanings for "ground truth". Anyone joining them without checking will invert
every metric.

### `hal_classifications` records no verdict at all

147,704 rows, and its columns are `category`, `confidence`, `latency_ms`,
`provider`, `model`, `previous_entry_hash`. **There is no column recording
whether a hallucination was detected.** It is a routing/telemetry log, not a
detection ledger — precision and recall are not computable from it, and a reader
who assumes otherwise will measure the wrong thing.

Two further facts about it, both measured:

- **`category` is constant.** `factual`/`high` in **99.968%** of rows, across
  **98,480 distinct prompts** — so this is not one prompt repeated. Six
  categories and three confidence levels exist; production uses one pair.
- **30% of rows (44,769) have a null `previous_entry_hash`**, so the hash chain
  this table implies is not continuous.

Neither is scored as a defect here — `category` may be a routing hint rather than
a claim — but both are stated because both were assumed otherwise at some point
during this pass.

---

## 6. NOT CHECKED — with the condition that would settle each

| item | why not checked | what would settle it |
|---|---|---|
| **HAL accuracy on live traffic** | the fleet has been down since 2026-07-17; the corpus ends 2026-06-24 | a redeploy (**Sean**), then re-export and re-run `check:hal-accuracy` |
| **Whether 0.9579 generalises** | 395 rows, 2 benchmark sources, one 7-week window | a second corpus from a different source and period |
| **The numeric/date proposal** | 16 rows, and the rule producing `proposed_verdict` is not derivable from the view's columns | the generating logic, then a sweep over the full corpus |
| **`hal_score`'s own ceiling** | AUC 0.9579 bounds every threshold, but not every *rescoring* | an ablation over `signals` / `hal_diagnostics`, which `hal_ablation_results` is shaped for and holds **0 rows** |
| **Whether `category` being constant is a defect** | no consumer of that column was traced | find the reader of `hal_classifications.category` and check what it branches on |

---

## 7. What changed in the repo

- `lib/hal/accuracy.ts` — pure, zero-import measurement module. Refuses pooled
  modes; returns `null` (not 0.5) where a class is absent; tie-aware AUC.
- `lib/hal/fixtures/runner-results-2026-08-16.json` — the 1,709-row corpus, so
  the number is reproducible in CI with no database.
- `scripts/hal-accuracy-test.mjs` — **14 assertions**.
- **4 mutations** registered: pooling refusal removed, undefined-as-chance,
  ties-full-credit, and counting failed generations. All CAUGHT (43 → 47).
