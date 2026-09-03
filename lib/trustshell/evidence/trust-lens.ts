// lib/trustshell/evidence/trust-lens.ts — a versioned, pluggable Trust Lens.
//
// Strategy §3.3: evidence is the truth; a SCORE is an interpretation. A Trust
// Lens is one interpretation — a named, versioned function from canonical
// evidence rows (canonical-evidence.ts) to a reputation reading, at read time.
//
//   EVIDENCE (canonical, append-only)
//        ├── Lens: repid-standard-2.3   → reading
//        ├── Lens: corporate-security    → reading   (weights/decay differ)
//        └── Lens: user-defined          → reading
//
// This buys three things the strategy names, and this file's tests prove the
// first two: you can change weights / decay / model WITHOUT rewriting history
// (two lenses over the SAME rows give two readings); different parties apply
// their own trust model to SHARED evidence; and a claim becomes precise and
// algorithm-versioned — "under lens `repid-standard-2.3`, evidence through
// <date>, domain <d>" — instead of one opaque proprietary number.
//
// THE SCORING ENGINE IS NOT REINVENTED. The default lens delegates to
// EarnedMetrics.ts unchanged — the read-time decay + empirical-Bayes shrinkage
// that already exists, measured and mutation-tested. What is NEW here is only the
// LENS ABSTRACTION around it: a stable `{id, version, apply}` shape, reading the
// canonical rows rather than the RepID-specific `repid_score_events` table, and
// carrying its own identity onto every reading. The lens MARKETPLACE (second and
// later lenses as a product) is deferred to "before scale" (strategy §6); this
// ships the interface and the one default.
//
// NO BAKED DEFAULT, INHERITED. EarnedMetrics resolves every metric to
// measured / insufficient / unmeasured and gives an unmeasured metric ZERO
// credit, never a filled-in default. A lens must not launder that away, so a
// reading carries the per-metric STATES beside the numbers, and the scalar-ish
// `scoringInputs` are EarnedMetrics' own honest coercion (unmeasured rate → 0,
// unmeasured latency → the worst point on the curve), never a midpoint.

import {
  measureRate,
  measureLatencyMs,
  toScoringInputs,
  describeEvidence,
  type Observation,
  type EarnedMetricSet,
  type ScoringInputs,
  type EvidenceReport,
} from '../EarnedMetrics';
import type { CanonicalEvidenceRow, EvidenceMetric } from './canonical-evidence';

/** How a lens weights and decays evidence. A different config is a different lens. */
export interface LensConfig {
  readonly halfLifeDays?: number;
  readonly priorStrength?: number;
  readonly priorValue?: number;
  readonly minEffectiveN?: number;
}

/** What a lens returns — an interpretation of evidence, stamped with its own identity. */
export interface LensReading {
  /** WHICH lens produced this. A reading with no lens identity is not a claim. */
  readonly lensId: string;
  readonly lensVersion: string;
  /** The newest observation the reading rests on — the "evidence through <date>" of the claim. Null when there was none. */
  readonly evidenceThrough: string | null;
  /** The domain the reading was scoped to, or null for a global reading. */
  readonly domain: string | null;
  /** How many rows the reading considered (after any domain filter). */
  readonly rowsConsidered: number;
  /** The per-metric three-state result from EarnedMetrics — the honest reading. */
  readonly metrics: EarnedMetricSet;
  /** measured / insufficient / unmeasured, per metric — carried so a reader cannot mistake absence for a low score. */
  readonly states: EvidenceReport;
  /**
   * The numbers a RepID calculator would take, via EarnedMetrics' own coercion
   * (unmeasured rate → 0 credit, unmeasured latency → worst). Deliberately NOT
   * reduced to a single scalar here: the final weighted RepID number is a further
   * step that needs the institution's weights (a driver/config), and baking one
   * in would re-hide the evidence the lens exists to expose.
   */
  readonly scoringInputs: ScoringInputs;
}

/** A named, versioned interpretation of canonical evidence. */
export interface TrustLens {
  readonly id: string;
  readonly version: string;
  /** Compute a reading from evidence rows, at the given instant. Optionally scoped to a domain. */
  apply(rows: readonly CanonicalEvidenceRow[], now: string | number, domain?: string): LensReading;
}

/** The EvidenceMetric → EarnedMetricSet key mapping. Kept explicit and total. */
const RATE_METRICS: Record<Exclude<EvidenceMetric, 'latency'>, keyof EarnedMetricSet> = {
  bft_accuracy: 'bftAccuracy',
  veritas_catch: 'veritasCatchRate',
  x402_success: 'x402SuccessRate',
};

/**
 * Build a lens from an id, version and config. The default `repid-standard-2.3`
 * is one call; a `corporate-security` lens with a longer memory or a stricter
 * prior is another call with a different config — over the SAME evidence.
 */
export function makeRepidLens(id: string, version: string, config: LensConfig = {}): TrustLens {
  // A reading with no lens identity is not a claim (the whole point of a versioned
  // lens), so a lens with no id or version is refused at construction rather than
  // producing anonymous readings. Independent verification flagged the footgun.
  if (!id || !version) {
    throw new Error('a Trust Lens must have a non-empty id and version — a reading with no lens identity is not a claim');
  }
  return {
    id,
    version,
    apply(rows, now, domain) {
      const scoped = domain ? rows.filter((r) => r.domain === domain) : rows;

      // Group into EarnedMetrics observations by metric. A row with metric=null,
      // or the wrong shape for its metric, bears on nothing — it is not coerced.
      const rateObs: Record<Exclude<EvidenceMetric, 'latency'>, Observation[]> = {
        bft_accuracy: [],
        veritas_catch: [],
        x402_success: [],
      };
      const latencyObs: { observedAt: string; latencyMs: number }[] = [];
      let newest = -Infinity;

      for (const r of scoped) {
        const t = Date.parse(r.observedAt);
        if (Number.isFinite(t) && t > newest) newest = t;
        if (r.metric === 'latency') {
          if (typeof r.latencyMs === 'number' && Number.isFinite(r.latencyMs)) {
            latencyObs.push({ observedAt: r.observedAt, latencyMs: r.latencyMs });
          }
        } else if (r.metric !== null) {
          // `in rateObs` guards the DB/HTTP boundary: the type forbids an unknown
          // metric, but a corrupted persisted row could carry one, and indexing a
          // missing bucket would crash the whole reading. An unrecognized metric
          // bears on nothing — treated as unclassified, exactly like `null`, never
          // faked into a signal. (Independent verification flagged the crash.)
          const bucket = rateObs[r.metric];
          if (bucket) bucket.push({ observedAt: r.observedAt, success: r.success, domain: r.domain });
        }
      }

      const opts = {
        now,
        halfLifeDays: config.halfLifeDays,
        priorStrength: config.priorStrength,
        priorValue: config.priorValue,
        minEffectiveN: config.minEffectiveN,
      };

      const metrics: EarnedMetricSet = {
        bftAccuracy: measureRate(rateObs.bft_accuracy, opts),
        veritasCatchRate: measureRate(rateObs.veritas_catch, opts),
        x402SuccessRate: measureRate(rateObs.x402_success, opts),
        latencyMs: measureLatencyMs(latencyObs, opts),
      };

      return {
        lensId: id,
        lensVersion: version,
        evidenceThrough: newest === -Infinity ? null : new Date(newest).toISOString(),
        domain: domain ?? null,
        rowsConsidered: scoped.length,
        metrics,
        states: describeEvidence(metrics),
        scoringInputs: toScoringInputs(metrics),
      };
    },
  };
}

/**
 * The default lens. `2.3` matches the version the strategy's worked example cites
 * ("under lens `repid-standard-2.3`, evidence through 2026-09-02, …"). Its config
 * is EarnedMetrics' own defaults (30-day half-life, prior strength 10, prior 0),
 * so it reproduces today's read-time scoring exactly — this is a rename into a
 * versioned lens, not a scoring change.
 */
export const repidStandard23Lens: TrustLens = makeRepidLens('repid-standard-2.3', '2.3');
