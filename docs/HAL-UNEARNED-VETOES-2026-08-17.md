# An unearned veto is worse than a coin flip

**Measured 2026-08-17** against `hal_runner_results` (Supabase
`qnnpjhlxljtqyigedwkb`), then committed as a fixture so it re-measures in CI.

This pays the debt `scripts/hal-accuracy-test.mjs` left as a failing-by-design
guard: the 2026-08-16 export omitted `hal_providers_used`, so every figure in
that suite was computed over a denominator it could not audit. The guard said
*re-export with the provider column and this assertion FAILS by design, which is
how the follow-up gets written instead of forgotten.* This is that follow-up.

---

## 1. The split

`fact-check-s2`, `gen_failed` excluded — 395 rows, 197 positives / 198 negatives.

| stratum | n | vetoes | correct | wrong | **veto precision** | **AUC** | mean latency |
|---|---|---|---|---|---|---|---|
| provider **ran** | 336 | 166 | 159 | 7 | **0.9578** | **0.9746** | 3158 ms |
| **no** provider | 59 | 41 | 19 | 22 | **0.4634** | **0.5150** | 947 ms |

AUC 0.5150 is chance. **A hal_score written without consulting a provider carries
no information about whether the answer was a hallucination**, and the veto cast
on it lands on a clean answer more often than on a real one — 22 of 41.

Three things this is *not*:

- **Not a provider outage.** `providers_attempted` is empty on all 59. The
  "tried and none succeeded" bucket is **zero rows**. HAL emitted `FACTUAL_ERROR`
  having never called a verifier. The attempted column was exported alongside the
  used one precisely so this could be told apart, and it separates cleanly.
- **Not `gen_failed`.** Those 69 rows are excluded before any of this; a failed
  generation is not a detection test.
- **Not the benchmark-difficulty story.** `_warning2` on the old fixture recorded
  a 0.5940-vs-0.9757 gap between `hal_test_cases` and `t12-overnight-2026-06` and
  called it heterogeneous difficulty. Split on **execution** instead and the gap
  is the same either side of the benchmark boundary. Source was a proxy;
  execution is the variable.

## 2. The finding that reframes an existing "win"

The suite already asserted that HAL's veto is **not** a pure threshold — 41 rows
are vetoed *below* the live 0.43 cut by other signals — and credited those extra
paths with beating the pure cut (realized F1 0.881188 vs 0.876033), *"they trade
precision for recall and win"*.

**Those 41 rows are exactly the 41 unearned vetoes.** Same set, verified both
directions:

- every sub-threshold veto has `providers_used_n = 0`;
- no unearned veto ever reached 0.43 on score alone.

So the extra veto paths are not a second detector earning its keep. Their entire
population is verdicts cast having consulted nothing, at 46.3% precision, and the
realized F1 advantage over a pure cut is bought entirely by them.

The prior assertion is not wrong — HAL really does cast those vetoes, and the
realized number really is higher. What changes is what it *means*, and the suite
now says so in the same place it says the number.

## 3. What was re-exported, and what was checked about it

`lib/hal/fixtures/runner-results-2026-08-17.json` — 1,709 rows, schema widened
from 7 fields to 9 with `providers_used_n` and `providers_attempted_n`.

**The export filter was recovered before re-exporting, not assumed.** The live
table holds 1,825 rows and the old fixture held 1,709; the difference is
`hal_score IS NOT NULL AND ground_truth_is_hallucination IS NOT NULL`, which
yields exactly 1,709 (115 rows lack a score/threshold, 1 lacks a label). Getting
this wrong would have moved every headline figure by changing the denominator.

**The corpus is unchanged.** `fact-check-s2` and `real` are identical to the
2026-08-16 export at the precision it stored; `(hal_mode, benchmark_source)`
counts are identical across all three modes. Every pre-existing assertion in the
suite still passes unmodified.

**One field differs and it is stated rather than smoothed over.** `hal_threshold`
on `mock` reads `1.0136433` live and `1.0136` in the old fixture, for rows that
have not been written since 2026-06-24. Whether the old export rounded or the
column changed is **UNRESOLVED**. It is recorded in the fixture's `_warning4`.
Nothing depends on it: `mock` carries no positive labels, so it has no AUC, and
every headline figure is `fact-check-s2`, where the threshold is 0.43 in both.

**A correction to my own working note.** Mid-measurement I reported that
`benchmark_source` had been rewritten since the export, on seeing
`CONTAMINATED-`-prefixed values in the new rows and not the old. That was wrong:
the `(mode, source)` counts match exactly, those labels are in both exports, and
the apparent mismatch was an artifact of comparing at 9 decimal places when the
old fixture stored 6. The real difference is the single `mock` threshold above.

## 4. In CI now

`check:hal-accuracy` — 16 assertions to 20. The new section E asserts the
execution split, the never-attempted fact, both AUCs, both precisions, and the
41-row identity. The failing-by-design guard is deleted, as it instructed.

Two mutations added, both CAUGHT:

- `hal-realized-confusion-uses-the-threshold` — models HAL as a pure cut. Every
  unearned veto sits below the line it never reached, so the entire finding
  vanishes from the numbers. This is the mutation that protects the finding.
- `hal-confusion-precision-counts-misses` — wrong denominator on precision, the
  one number a staking design has to price.

The old fixture is deleted rather than left beside the new one; nothing
referenced it, and a stale corpus next to a current one is a trap.

## 5. What this does NOT establish

- **It says nothing about the live veto path.** This is the benchmark corpus.
  `repid_score_events` — 70,020 live HAL vetoes — has **no provider column at
  all**, so "unearned" is not distinguishable in production today. It is
  measurable here only.
- **It does not identify an issuer.** `counterparty_agent_id` is NULL on all
  70,020 live veto events. Issuer staking cannot price a cost against an identity
  that is never recorded; that blocker is unchanged by this work and sits with
  the lane that owns the writer.
- **`providers_used_n` is a COUNT, not the provider names.** It answers "did HAL
  consult anything", not "which one". A per-provider reliability question needs
  another export.
- **No claim about *why* HAL skipped the providers.** The rows record that it did,
  at 947 ms against ~3,158 ms, and nothing here explains the cause.
- **The corpus is static** — last row 2026-06-24, zero rows written since. These
  figures describe that window and are not a live monitor.
