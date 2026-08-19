// lib/trustshell/lane-files.ts
//
// The four artifacts the lanes must land, and what can actually be MEASURED
// about each one.
//
// ZERO IMPORTS. Same reasoning as `promotion.ts`, which consumes what this
// produces: a decision that ends up in a status table must be runnable
// standalone, or nobody checks it.
//
// ── WHY THIS IS NOT A FILE-EXISTS CHECK ─────────────────────────────────────
//
// "The four required files have landed" is a claim about the world, and the
// first thing to do with it is look. Two had landed (`docs/policy/*`, on
// `xc/policy-lock`); two did not exist on any ref in the repository. A harness
// that reports "4 registered" from a list it was handed has measured nothing.
//
// So `MANDATORY` is the list of paths, and every artifact carries CONTENT
// checks that can fail — not a schema-shaped nod. The strongest ones recompute
// the document's own numbers from the document's own formulas:
//
//   `authority-policy.v0.5.yaml` publishes a referral curve
//   `δ_raw(n) = 40/(n+1)`, a clamp `c(n)`, and five worked values. Those worked
//   values are DERIVABLE. If the table and the formula disagree, one of them is
//   wrong and the file is not shippable — and no amount of prose review finds
//   it. All five reproduce (verified 2026-08-19).
//
// ── WHAT IT DELIBERATELY REFUSES TO DO ──────────────────────────────────────
//
// It does not grade prose, tone, or completeness of argument. A structural gate
// that starts having opinions about wording becomes unfalsifiable, and this
// repo's standing rule is that surface copy is not tonight's work. Every check
// below either recomputes a number, resolves a cross-reference, or asserts a
// set relation.
//
// It also does not accept a document's OWN status table as evidence. The policy
// file publishes `status.live: [...]`. That is an asserted stage, which is
// exactly what `promotion.ts` exists to refuse. `liveClaimsNeedingBacking`
// extracts those claims so a caller must resolve each one against a real gate
// run in this repository.

/** Which lane owns the artifact. Used only to route a failure back. */
export type Lane = 'XC' | 'GA';

export interface MandatoryArtifact {
  path: string;
  lane: Lane;
  /** What the file is for, in the terms the failure prompt will use. */
  purpose: string;
  format: 'yaml' | 'json' | 'json-schema' | 'markdown';
}

/**
 * The four landing zones. Paths are exact — a file at a near-miss path is a
 * MISS, because everything downstream resolves by path.
 */
export const MANDATORY: readonly MandatoryArtifact[] = Object.freeze([
  {
    path: 'docs/policy/authority-policy.v0.5.yaml',
    lane: 'XC',
    purpose: 'five-axis Π weights, decay envelope, referral curve, effectiveAuthority',
    format: 'yaml',
  },
  {
    path: 'docs/policy/anfis-objective.md',
    lane: 'XC',
    purpose: 'ANFIS-TS + LASSO routing objective, hot/warm/cold degradation',
    format: 'markdown',
  },
  {
    path: 'docs/contracts/events.v1.json',
    lane: 'GA',
    purpose: 'decay / referral / impact event schemas and lifecycle contracts',
    format: 'json',
  },
  {
    path: 'docs/contracts/capability-declaration.schema.json',
    lane: 'GA',
    purpose: 'Capability Declaration interface the router consumes',
    format: 'json-schema',
  },
]);

export type FindingLevel = 'PRESENT' | 'ABSENT' | 'MALFORMED' | 'INCONSISTENT';

export interface ArtifactFinding {
  path: string;
  lane: Lane;
  level: FindingLevel;
  /** One line, precise enough to become a targeted failure prompt. */
  detail: string;
}

// ── The referral curve, restated so it can be recomputed ────────────────────
//
// Written from the FORMULA in the file, not from its worked values. A checker
// that read the table and compared it to itself would ratify any error the
// moment someone re-recorded it — the same trap `COST_MODEL` avoids.

/** `δ_raw(n) = 20 · (2/(n+1)) = 40/(n+1)`. */
export function referralRaw(n: number): number {
  return 40 / (n + 1);
}

/** The per-rank clamp `c(n)`: 12 at n=1, 8 for n∈[2,3], 5 for n≥4. */
export function referralClamp(n: number): number {
  if (n <= 1) return 12;
  if (n <= 3) return 8;
  return 5;
}

/** `δ(n) = clip(round(δ_raw(n)), 0, c(n))`. */
export function referralDelta(n: number): number {
  return Math.min(Math.max(Math.round(referralRaw(n)), 0), referralClamp(n));
}

/**
 * Do the file's published worked values follow from its own formula?
 *
 * Returns the disagreements. Empty means the table is derivable — which is the
 * check that a reviewer cannot perform by reading, and the one a lane is most
 * likely to get wrong when hand-editing a locked document.
 */
export function referralDisagreements(
  worked: ReadonlyArray<{ n: number; raw: number; delta: number }>
): string[] {
  const out: string[] = [];
  for (const w of worked) {
    const raw = referralRaw(w.n);
    // The file rounds `raw` for display; compare at the precision it publishes.
    const shown = Math.abs(raw - w.raw) <= 0.01;
    if (!shown) out.push(`n=${w.n}: file says raw ${w.raw}, formula gives ${raw.toFixed(3)}`);
    const delta = referralDelta(w.n);
    if (delta !== w.delta) out.push(`n=${w.n}: file says δ ${w.delta}, formula gives ${delta}`);
  }
  return out;
}

/**
 * The eight referral mutants, as predicates over the curve itself.
 *
 * M1–M3 are computable from the formula alone; the rest are policy conditions
 * on inputs this file cannot see. Returning only what is decidable, named, is
 * the point — the alternative is an eight-of-eight green that quietly includes
 * five nods.
 */
export function decidableMutants(): Array<{ id: string; holds: boolean; detail: string }> {
  const d1 = referralDelta(1);
  const d10 = referralDelta(10);
  const d100 = referralDelta(100);
  return [
    {
      id: 'M1_first_gt_tenth',
      holds: d1 > d10,
      detail: `δ(1)=${d1} > δ(10)=${d10}`,
    },
    {
      id: 'M2_tenth_gg_hundredth',
      holds: d10 > d100 && d100 === 0,
      detail: `δ(10)=${d10} > δ(100)=${d100}, and δ(100) is zero`,
    },
    {
      id: 'M3_hundredth_zero',
      holds: d100 === 0,
      detail: `δ(100)=${d100}`,
    },
  ];
}

/** Weight vectors must sum to 1 or the composite is not a weighted mean. */
export function sumsToOne(values: readonly number[], tolerance = 1e-9): boolean {
  const total = values.reduce((a, b) => a + b, 0);
  return Math.abs(total - 1) <= tolerance;
}

/**
 * Stage names a document claims for itself, which a caller MUST back with a
 * real gate run before any of them counts.
 *
 * Named `…NeedingBacking` rather than `liveSurfaces` so a call site cannot read
 * the return value as a list of live things. It is a list of assertions.
 */
export function liveClaimsNeedingBacking(status: {
  live?: readonly string[];
}): string[] {
  return [...(status.live ?? [])];
}

/**
 * A surface may appear in exactly one status bucket.
 *
 * Overlap is not a typo when the buckets are `live` and `blocked` — it is two
 * incompatible claims about the same thing, and whichever a reader hits first
 * wins.
 */
export function bucketOverlaps(status: Record<string, readonly string[] | undefined>): string[] {
  const seen = new Map<string, string>();
  const out: string[] = [];
  for (const [bucket, items] of Object.entries(status)) {
    for (const item of items ?? []) {
      const prior = seen.get(item);
      if (prior) out.push(`"${item}" is in both ${prior} and ${bucket}`);
      else seen.set(item, bucket);
    }
  }
  return out;
}
