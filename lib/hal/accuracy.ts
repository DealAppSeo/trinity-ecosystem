// lib/hal/accuracy.ts
//
// How well does HAL actually detect hallucinations? Measured, not asserted.
//
// ZERO IMPORTS, deliberately — same reasoning as `hal-receipt.ts`. Every
// function here is a claim about a number that will end up in a document, and a
// claim you cannot run standalone is a claim nobody checks.
//
// ── THE TRAP THIS FILE EXISTS TO MAKE UNREPEATABLE ──────────────────────────
//
// `hal_runner_results` holds three `hal_mode` populations whose `hal_score`
// means a DIFFERENT THING in each:
//
//   mock            653 rows, scores 50.05–89.99, ZERO labelled hallucinations
//   real            592 rows, scores  0.26–0.42,  ZERO labelled hallucinations
//   fact-check-s2   464 rows, scores  0.00–1.00,  ALL 233 labelled hallucinations
//
// Pooled, the corpus reports **AUC 0.4644 — worse than chance**, and a reader
// concludes HAL is broken. Within `fact-check-s2` the same score reports **AUC
// 0.8351** and separates cleanly (mean 0.78 on hallucinations vs 0.10 on clean
// answers). The pooled figure is an artifact: 653 mock rows on a 50–90 scale,
// all negative, outrank every real detection and invert the ordering.
//
// This is the exact failure mode LESSONS records for real data — an assumption
// about the SHAPE of the sample, made without checking it. So the pooling is not
// a caveat in a comment here. `requireSingleMode` THROWS, and every entry point
// calls it. You cannot compute an accuracy number across modes with this module.
//
// ── UNDEFINED IS NOT 0.5, AND NOT ZERO ──────────────────────────────────────
//
// `mock` and `real` contain no positive labels at all, so AUC is not defined on
// them. `rocAuc` returns `null` there rather than a number. Two outcomes would
// collapse "we could not measure this" into "it scored badly" — which is how
// the pooled 0.4644 would have been published in the first place.

/** One scored attempt. Mirrors the columns the export actually carries. */
export interface ScoredRow {
  mode: string;
  score: number;
  isHallucination: boolean;
  /** Generation failed — there was no answer to judge. Not a detection test. */
  genFailed: boolean;
  /** HAL's REAL decision. Not `score >= threshold`; extra veto paths also fire. */
  vetoed: boolean;
  threshold: number;
}

export class PooledModes extends Error {
  constructor(readonly modes: readonly string[]) {
    super(
      `refusing to compute an accuracy figure across ${modes.length} hal_modes ` +
        `(${modes.join(', ')}). hal_score is not comparable between modes — pooling them ` +
        'reports AUC 0.4644, worse than chance, for a detector that scores 0.8351 within ' +
        'fact-check-s2. Partition first, then measure each mode on its own.'
    );
    this.name = 'PooledModes';
  }
}

/** Every entry point calls this. The refusal is the feature. */
export function requireSingleMode(rows: readonly ScoredRow[]): string {
  const modes = [...new Set(rows.map((r) => r.mode))].sort();
  if (modes.length > 1) throw new PooledModes(modes);
  return modes[0] ?? '(empty)';
}

/**
 * Rows a detection metric may be computed over.
 *
 * Drops `genFailed`: when generation failed there is no answer, so the detector
 * was never asked a question. Counting those as misses would charge HAL for a
 * provider outage.
 */
export function usable(rows: readonly ScoredRow[]): ScoredRow[] {
  return rows.filter((r) => !r.genFailed);
}

export interface Confusion {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

function confusion(tp: number, fp: number, fn: number, tn: number): Confusion {
  const precision = tp + fp === 0 ? null : tp / (tp + fp);
  const recall = tp + fn === 0 ? null : tp / (tp + fn);
  const f1 = 2 * tp + fp + fn === 0 ? null : (2 * tp) / (2 * tp + fp + fn);
  return { tp, fp, fn, tn, precision, recall, f1 };
}

/** Confusion matrix for the rule `score >= threshold`. */
export function confusionAt(rows: readonly ScoredRow[], threshold: number): Confusion {
  requireSingleMode(rows);
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
  for (const r of rows) {
    const flagged = r.score >= threshold;
    if (flagged && r.isHallucination) tp++;
    else if (flagged) fp++;
    else if (r.isHallucination) fn++;
    else tn++;
  }
  return confusion(tp, fp, fn, tn);
}

/** Confusion matrix for HAL's OWN decision, whatever produced it. */
export function realizedConfusion(rows: readonly ScoredRow[]): Confusion {
  requireSingleMode(rows);
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
  for (const r of rows) {
    if (r.vetoed && r.isHallucination) tp++;
    else if (r.vetoed) fp++;
    else if (r.isHallucination) fn++;
    else tn++;
  }
  return confusion(tp, fp, fn, tn);
}

/**
 * Area under the ROC curve, by the Mann–Whitney statistic.
 *
 * Ties get half credit — the statistically correct handling, and NOT what a
 * naive SQL `rank()` does. A min-rank implementation reports a slightly
 * different number on any corpus with repeated scores; the difference is real
 * and this is the side of it that is right.
 *
 * Returns `null` when either class is absent. See the header: undefined is not
 * 0.5 and not zero.
 */
export function rocAuc(rows: readonly ScoredRow[]): number | null {
  requireSingleMode(rows);
  const pos = rows.filter((r) => r.isHallucination).map((r) => r.score);
  const neg = rows.filter((r) => !r.isHallucination).map((r) => r.score);
  if (pos.length === 0 || neg.length === 0) return null;

  let wins = 0;
  for (const p of pos) {
    for (const n of neg) {
      if (p > n) wins += 1;
      else if (p === n) wins += 0.5;
    }
  }
  return wins / (pos.length * neg.length);
}

export interface SweepPoint extends Confusion {
  threshold: number;
}

/** Every threshold that can change the outcome — the observed scores themselves. */
export function sweep(rows: readonly ScoredRow[]): SweepPoint[] {
  requireSingleMode(rows);
  const thresholds = [...new Set(rows.map((r) => r.score))].sort((a, b) => a - b);
  return thresholds.map((threshold) => ({ threshold, ...confusionAt(rows, threshold) }));
}

/**
 * The best F1 ANY threshold on this score can reach — the ceiling.
 *
 * Computing this before tuning is the standing rule: two sprints were once
 * spent optimising a component already at 97.9% of its bound, because nobody
 * had measured the bound.
 *
 * Ties break toward the HIGHER threshold. Among equal-F1 cuts the stricter one
 * raises precision, and a false veto costs a real answer.
 */
export function bestF1(rows: readonly ScoredRow[]): SweepPoint | null {
  const points = sweep(rows).filter((p) => p.f1 !== null);
  if (points.length === 0) return null;
  return points.reduce((best, p) =>
    p.f1! > best.f1! || (p.f1! === best.f1! && p.threshold > best.threshold) ? p : best
  );
}

export interface Headroom {
  realizedF1: number | null;
  bestF1: number | null;
  bestThreshold: number | null;
  /** bestF1 − realizedF1. Small means tuning the cut is not where the win is. */
  absoluteGain: number | null;
  /** realizedF1 / bestF1. The "how close to the bound are we" number. */
  fractionOfCeiling: number | null;
}

/** What is actually left on the table from moving the threshold. */
export function headroom(rows: readonly ScoredRow[]): Headroom {
  const realized = realizedConfusion(rows);
  const best = bestF1(rows);
  const r = realized.f1;
  const b = best?.f1 ?? null;
  return {
    realizedF1: r,
    bestF1: b,
    bestThreshold: best?.threshold ?? null,
    absoluteGain: r !== null && b !== null ? b - r : null,
    fractionOfCeiling: r !== null && b !== null && b !== 0 ? r / b : null,
  };
}

/** Split a mixed export into per-mode populations. The only safe way in. */
export function partitionByMode(rows: readonly ScoredRow[]): Map<string, ScoredRow[]> {
  const out = new Map<string, ScoredRow[]>();
  for (const r of rows) {
    const list = out.get(r.mode);
    if (list) list.push(r);
    else out.set(r.mode, [r]);
  }
  return out;
}
