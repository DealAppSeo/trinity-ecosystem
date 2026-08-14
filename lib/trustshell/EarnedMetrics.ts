// lib/trustshell/EarnedMetrics.ts
//
// Turns recorded outcomes into the metrics RepID scores on.
//
// WHY THIS EXISTS. `app/api/trustrails/pay/route.ts` fed the RepID calculator
// four literals — bftAccuracy 94, veritasCatchRate 97, x402SuccessRate 100,
// latencyMs 180 — on the live payment path. The calculator's maths is real, its
// weights load from `institution_risk_config`, and none of that mattered: with
// constant inputs every agent scored the same constant, so RepID could not rise
// or fall with behaviour. A reputation that cannot change is not a reputation.
//
// THE CORE RULE, carried over from the harness work: a self-report cannot reach
// a ranking; only an earned outcome can. Everything here is computed from rows
// that record something that already happened.
//
// THREE STATES, NEVER TWO. Every metric resolves to `measured`, `insufficient`
// or `unmeasured`. Collapsing those into a number is how "we did not look"
// becomes "it passed" — the recurring defect this codebase keeps rediscovering.
// An unmeasured metric contributes ZERO credit and says so. It is never filled
// in with a default, and the weight is never renormalised away, because both of
// those let an agent score higher by having less evidence.
//
// This module is dependency-free and does no I/O on purpose: it must run
// unchanged in a route, a script, a test, or an edge runtime. Callers fetch
// rows; this decides what they mean.

/** A single recorded outcome. One row of evidence. */
export interface Observation {
  /** ISO timestamp of when the outcome happened. */
  observedAt: string;
  /** True when this observation counts as a success for the metric in question. */
  success: boolean;
  /** Optional domain tag, so a score can be scoped rather than global. */
  domain?: string | null;
}

export type MetricState = 'measured' | 'insufficient' | 'unmeasured';

export interface MeasuredMetric {
  state: MetricState;
  /**
   * Shrunk success rate in [0,1], or null when nothing was measured.
   * Null is deliberate: a caller that wants a number must handle its absence,
   * rather than receiving a plausible default it cannot distinguish from data.
   */
  value: number | null;
  /** Raw decay-weighted rate before shrinkage — diagnostic only, never scored. */
  rawValue: number | null;
  /** Evidence weight after decay. Fresh observations count ~1, old ones less. */
  effectiveN: number;
  /** Unweighted row count, for reporting "measured over N outcomes". */
  observations: number;
  /** effectiveN / (effectiveN + PRIOR_STRENGTH) — how far value escaped the prior. */
  confidence: number;
  /** Age in days of the newest observation, or null when there are none. */
  freshnessDays: number | null;
  /** Human-readable justification. Goes in the API response, not just a log. */
  reason: string;
}

/**
 * Half-life for evidence decay. Matches RECENCY_HALF_LIFE_DAYS in MemoryRecall so
 * the two subsystems agree on what "recent" means.
 *
 * This is load-bearing here. `repid_score_events` is not stationary: the veto
 * rate ran 92% in May, 73% in June, 68% in July and ~5% in August, and the
 * evaluator that produced the earlier numbers is independently known to have
 * vetoed true claims about internal systems. An undecayed lifetime average would
 * report that regime as if it were the agent's behaviour today.
 */
export const RECENCY_HALF_LIFE_DAYS = 30;

/**
 * Evidence weight at which an observation set counts equally with the prior.
 * At effectiveN = 10 a metric is half its own and half the prior.
 */
export const PRIOR_STRENGTH = 10;

/**
 * Shrinkage target. Zero, not 0.5 and not the population mean.
 *
 * This is the conservative choice and it is chosen for the gating case: this
 * metric decides whether an agent may move money, so absent evidence must cost,
 * never pay. Shrinking toward a population mean would let a brand-new agent
 * inherit the fleet's earned reputation, which is the laundering vector the
 * whole design exists to prevent.
 *
 * The known cost is a cold start: a genuinely good new agent reads low until it
 * accumulates evidence. That is correct for spending authority and WRONG for
 * exploration — a router that ranked on this would never try the newcomer and so
 * would never generate the evidence. A router should instead use an upper
 * confidence bound built from `value` and `confidence`, which is why
 * `confidence` is part of the returned shape rather than an internal detail.
 */
export const PRIOR_VALUE = 0;

/** Below this evidence weight a metric reports `insufficient` and scores zero. */
export const MIN_EFFECTIVE_N = 1;

function decayWeight(observedAt: string, now: number, halfLifeDays: number): number {
  const t = Date.parse(observedAt);
  if (!Number.isFinite(t)) return 0;
  const ageDays = (now - t) / 86_400_000;
  // An observation timestamped in the future is clock skew or a forged row.
  // Clamping to age 0 caps its influence at that of a fresh one rather than
  // letting a future date earn extra weight.
  if (ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * An explicitly unmeasured metric carrying why.
 *
 * "No rows came back for this agent" and "no table in this system records this
 * signal at all" are very different facts, and a caller that cannot tell them
 * apart will eventually report the second as the first. bftAccuracy is the live
 * example: `trinity_receipt_bft_results` and `bft_payment_evaluations` both hold
 * zero rows, so no agent can ever have BFT evidence — that is a missing
 * subsystem, not a quiet agent.
 */
export function unmeasured(reason: string): MeasuredMetric {
  return { ...UNMEASURED, reason };
}

export interface MeasureOptions {
  /** Evaluation instant. Injected so results are deterministic under test. */
  now?: string | number;
  halfLifeDays?: number;
  priorStrength?: number;
  priorValue?: number;
  minEffectiveN?: number;
  /** When set, only observations carrying this domain are counted. */
  domain?: string;
}

const UNMEASURED: MeasuredMetric = {
  state: 'unmeasured',
  value: null,
  rawValue: null,
  effectiveN: 0,
  observations: 0,
  confidence: 0,
  freshnessDays: null,
  reason: 'no observations',
};

/**
 * Decay-weighted, shrunk success rate over a set of observations.
 *
 * Returns `unmeasured` for an empty set and `insufficient` when the surviving
 * evidence weight is below `minEffectiveN` — which is the common case for an
 * agent whose only outcomes are months old, and exactly the case a lifetime
 * average would misreport as confident.
 */
export function measureRate(
  observations: readonly Observation[],
  opts: MeasureOptions = {}
): MeasuredMetric {
  const now = typeof opts.now === 'number' ? opts.now : Date.parse(opts.now ?? new Date().toISOString());
  const halfLife = opts.halfLifeDays ?? RECENCY_HALF_LIFE_DAYS;
  const k = opts.priorStrength ?? PRIOR_STRENGTH;
  const prior = opts.priorValue ?? PRIOR_VALUE;
  const floor = opts.minEffectiveN ?? MIN_EFFECTIVE_N;

  const rows = opts.domain ? observations.filter((o) => o.domain === opts.domain) : observations;
  if (rows.length === 0) {
    return { ...UNMEASURED, reason: opts.domain ? `no observations in domain "${opts.domain}"` : 'no observations' };
  }

  let weight = 0;
  let successWeight = 0;
  let newest = -Infinity;

  for (const o of rows) {
    const w = decayWeight(o.observedAt, now, halfLife);
    weight += w;
    if (o.success) successWeight += w;
    const t = Date.parse(o.observedAt);
    if (Number.isFinite(t) && t > newest) newest = t;
  }

  const freshnessDays = newest === -Infinity ? null : Math.max(0, (now - newest) / 86_400_000);
  const rawValue = weight > 0 ? successWeight / weight : null;
  const confidence = weight / (weight + k);

  if (weight < floor) {
    return {
      state: 'insufficient',
      value: null,
      rawValue,
      effectiveN: weight,
      observations: rows.length,
      confidence,
      freshnessDays,
      reason:
        `${rows.length} observation(s) decayed to ${weight.toFixed(3)} effective weight, ` +
        `below the ${floor} required` +
        (freshnessDays !== null ? ` (newest is ${freshnessDays.toFixed(1)}d old)` : ''),
    };
  }

  const value = (successWeight + k * prior) / (weight + k);

  return {
    state: 'measured',
    value,
    rawValue,
    effectiveN: weight,
    observations: rows.length,
    confidence,
    freshnessDays,
    reason:
      `${rows.length} observation(s), ${weight.toFixed(2)} effective weight after ` +
      `${halfLife}d half-life decay; shrunk toward ${prior} at strength ${k}`,
  };
}

/**
 * Latency is not a success rate, so it gets its own reducer: a decay-weighted
 * mean in milliseconds. Returned raw rather than normalised, because the
 * normalisation curve belongs to RepIDConfig, which owns the scoring.
 */
export function measureLatencyMs(
  samples: readonly { observedAt: string; latencyMs: number }[],
  opts: MeasureOptions = {}
): MeasuredMetric {
  const now = typeof opts.now === 'number' ? opts.now : Date.parse(opts.now ?? new Date().toISOString());
  const halfLife = opts.halfLifeDays ?? RECENCY_HALF_LIFE_DAYS;
  const k = opts.priorStrength ?? PRIOR_STRENGTH;
  const floor = opts.minEffectiveN ?? MIN_EFFECTIVE_N;

  const rows = samples.filter((s) => Number.isFinite(s.latencyMs) && s.latencyMs >= 0);
  if (rows.length === 0) return { ...UNMEASURED, reason: 'no latency samples' };

  let weight = 0;
  let sum = 0;
  let newest = -Infinity;
  for (const s of rows) {
    const w = decayWeight(s.observedAt, now, halfLife);
    weight += w;
    sum += w * s.latencyMs;
    const t = Date.parse(s.observedAt);
    if (Number.isFinite(t) && t > newest) newest = t;
  }

  const freshnessDays = newest === -Infinity ? null : Math.max(0, (now - newest) / 86_400_000);
  const mean = weight > 0 ? sum / weight : null;
  const confidence = weight / (weight + k);

  if (weight < floor) {
    return {
      state: 'insufficient',
      value: null,
      rawValue: mean,
      effectiveN: weight,
      observations: rows.length,
      confidence,
      freshnessDays,
      reason: `${rows.length} latency sample(s) decayed to ${weight.toFixed(3)}, below the ${floor} required`,
    };
  }

  return {
    state: 'measured',
    value: mean,
    rawValue: mean,
    effectiveN: weight,
    observations: rows.length,
    confidence,
    freshnessDays,
    reason: `${rows.length} latency sample(s), ${weight.toFixed(2)} effective weight`,
  };
}

/**
 * The four inputs RepIDCalculator takes, each with its provenance attached.
 * `humanCustody` stays a boolean from the KYA registry — it is a registered fact
 * rather than a measured rate, and pretending otherwise would be its own lie.
 */
export interface EarnedMetricSet {
  bftAccuracy: MeasuredMetric;
  veritasCatchRate: MeasuredMetric;
  x402SuccessRate: MeasuredMetric;
  latencyMs: MeasuredMetric;
}

export interface ScoringInputs {
  bftAccuracy: number;
  veritasCatchRate: number;
  x402SuccessRate: number;
  latencyMs: number;
}

export interface EvidenceReport {
  measured: string[];
  insufficient: string[];
  unmeasured: string[];
  /** True only when every metric is `measured`. */
  fullyMeasured: boolean;
  /** Lowest confidence across measured metrics; 0 when none are measured. */
  weakestConfidence: number;
  detail: Record<string, { state: MetricState; observations: number; effectiveN: number; reason: string }>;
}

/**
 * Collapse a metric set into the numbers RepIDCalculator expects.
 *
 * An unmeasured or insufficient rate becomes 0 — no credit — rather than a
 * default. Latency is the one asymmetric case: an unmeasured latency becomes the
 * worst value on the scoring curve (2000ms, where RepIDConfig's normalisation
 * reaches zero) for the same reason. Using 0ms there would award a *perfect*
 * latency score for having no data, which is precisely backwards.
 */
export function toScoringInputs(m: EarnedMetricSet): ScoringInputs {
  const rate = (x: MeasuredMetric) => (x.state === 'measured' && x.value !== null ? x.value * 100 : 0);
  return {
    bftAccuracy: rate(m.bftAccuracy),
    veritasCatchRate: rate(m.veritasCatchRate),
    x402SuccessRate: rate(m.x402SuccessRate),
    latencyMs:
      m.latencyMs.state === 'measured' && m.latencyMs.value !== null ? m.latencyMs.value : 2000,
  };
}

export function describeEvidence(m: EarnedMetricSet): EvidenceReport {
  const entries = Object.entries(m) as [keyof EarnedMetricSet, MeasuredMetric][];
  const measured = entries.filter(([, v]) => v.state === 'measured').map(([k]) => k);
  const insufficient = entries.filter(([, v]) => v.state === 'insufficient').map(([k]) => k);
  const unmeasured = entries.filter(([, v]) => v.state === 'unmeasured').map(([k]) => k);

  const detail: EvidenceReport['detail'] = {};
  for (const [k, v] of entries) {
    detail[k] = { state: v.state, observations: v.observations, effectiveN: v.effectiveN, reason: v.reason };
  }

  return {
    measured,
    insufficient,
    unmeasured,
    fullyMeasured: measured.length === entries.length,
    weakestConfidence: measured.length
      ? Math.min(...entries.filter(([, v]) => v.state === 'measured').map(([, v]) => v.confidence))
      : 0,
    detail,
  };
}
