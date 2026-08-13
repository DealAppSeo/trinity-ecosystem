// lib/trustshell/harness/router.ts — top-K expert routing with trust weighting.
//
// Addresses four named MoE failures:
//
//   * Token routing bottlenecks — congestion is a ranking input, not just a
//     hard gate, so load spreads before anything hits a wall.
//   * Top-K alternative routing — the decision carries ranked alternates, so a
//     caller that fails over does not have to re-run the whole ranking.
//   * Cold-start routing failures — a fraction of decisions is reserved for
//     under-observed experts, otherwise the router's own history permanently
//     excludes anyone new.
//   * Opaque failure attribution — every decision records the full score
//     breakdown and every rejection with its reason.
//
// THE RANKING INPUT IS EARNED REPUTATION ONLY. `ExpertProfile.perceivedScore`
// exists so callers can watch the earned/perceived gap; it can never move a
// rank. See types.ts for why.

import {
  BPS_MAX,
  type Bps,
  type Clock,
  type ExpertId,
  type ExpertProfile,
  type Rejection,
  type RejectionReason,
  type RoutingDecision,
  type Task,
  cosineSimilarity,
} from '@/lib/trustshell/harness/types';
import type { CapacityGovernor } from '@/lib/trustshell/harness/capacity';
import type { LeakyBucketLimiter } from '@/lib/trustshell/harness/leaky-bucket';

export interface RouterConfig {
  /** Relative pull of capability/embedding fit. */
  similarityWeight?: number;
  /** Relative pull of earned reputation. */
  trustWeight?: number;
  /** How hard congestion pushes an expert down. */
  congestionWeight?: number;
  /** Experts below this earned score are never selected. 0 disables. */
  trustFloor?: Bps;
  /** Fraction of decisions reserved for cold-start experts, 0..1. */
  explorationRate?: number;
  /** How many alternates to carry on the decision. */
  alternatesCount?: number;
}

const DEFAULTS: Required<Omit<RouterConfig, 'trustFloor'>> & { trustFloor: Bps } = {
  similarityWeight: 1.0,
  trustWeight: 1.0,
  congestionWeight: 0.75,
  trustFloor: 0,
  explorationRate: 0.1,
  alternatesCount: 3,
};

/** Deterministic RNG seam. Simulations and tests must be reproducible. */
export interface Rng {
  next(): number;
}

export const mathRandomRng: Rng = { next: () => Math.random() };

/**
 * Seeded PRNG. Identical across runs and platforms.
 *
 * The state is conditioned with splitmix32 before use, and the first few
 * outputs are discarded. Both steps are necessary rather than cautious: raw
 * xorshift seeded with small consecutive integers (1, 2, 3 …) emits
 * systematically small first draws, so a simulation that creates a fresh
 * generator per trial and reads one value gets a badly skewed distribution.
 * Caught by the exploration-rate assertion in
 * scripts/harness-routing-test.mjs, which observed 1.00 against an expected
 * 0.25 — the kind of bias that silently invalidates every simulation run
 * downstream of it.
 */
export class SeededRng implements Rng {
  private s: number;

  constructor(seed = 1) {
    // splitmix32 finalizer: decorrelates nearby seeds before they reach the
    // generator, so seed 1 and seed 2 start in unrelated parts of the state.
    let z = (seed >>> 0) || 0x9e3779b9;
    z = (z + 0x9e3779b9) >>> 0;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    this.s = (z ^ (z >>> 15)) >>> 0 || 0x9e3779b9;

    // Discard the first outputs: xorshift needs a few rounds to diffuse.
    for (let i = 0; i < 8; i += 1) this.next();
  }

  next(): number {
    let x = this.s;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.s = x;
    return x / 0x1_0000_0000;
  }
}

export interface RouteOptions {
  /** Experts the caller has already tried and wants excluded. */
  exclude?: ExpertId[];
  /** Predicate for breaker state. Returning true means "do not route here". */
  isCircuitOpen?: (expert: ExpertId) => boolean;
}

export class TrustRouter {
  private readonly cfg: Required<RouterConfig>;

  constructor(
    private readonly clock: Clock,
    private readonly limiter: LeakyBucketLimiter,
    private readonly capacity: CapacityGovernor,
    config: RouterConfig = {},
    private readonly rng: Rng = mathRandomRng
  ) {
    this.cfg = { ...DEFAULTS, ...config };
    if (this.cfg.explorationRate < 0 || this.cfg.explorationRate > 1) {
      throw new Error('explorationRate must be in [0, 1]');
    }
  }

  /**
   * Rank experts for a task and select one.
   *
   * Hard gates run first and produce rejections; survivors are scored. An
   * expert refused by a gate never appears in `scores`, because it was never a
   * candidate — conflating "scored badly" with "not eligible" is how routing
   * bugs hide.
   */
  route(task: Task, experts: ExpertProfile[], options: RouteOptions = {}): RoutingDecision {
    const rejected: Rejection[] = [];
    const excluded = new Set(options.exclude ?? []);
    const estimatedTokens = task.estimatedTokens ?? 0;

    const candidates = experts.filter((e) => {
      if (excluded.has(e.id)) {
        rejected.push({
          expert: e.id,
          reason: 'excluded_by_caller',
          detail: 'Caller excluded this expert, typically after a failed attempt.',
        });
        return false;
      }

      const missing = task.requires.filter((c) => !e.capabilities.includes(c));
      if (missing.length > 0) {
        rejected.push({
          expert: e.id,
          reason: 'missing_capability',
          detail: `Missing: ${missing.join(', ')}.`,
        });
        return false;
      }

      if (options.isCircuitOpen?.(e.id)) {
        rejected.push({
          expert: e.id,
          reason: 'circuit_open',
          detail: 'Circuit breaker is open for this expert.',
        });
        return false;
      }

      // The trust floor never applies to cold-start experts. Applying it would
      // make the floor self-fulfilling: a new expert has no earned score, gets
      // filtered, never runs, and never earns one.
      if (!e.coldStart && this.cfg.trustFloor > 0 && e.earnedScore < this.cfg.trustFloor) {
        rejected.push({
          expert: e.id,
          reason: 'below_trust_floor',
          detail: `Earned ${e.earnedScore} bps is below the ${this.cfg.trustFloor} bps floor.`,
        });
        return false;
      }

      if (this.capacity.inFlight(e.id) >= this.capacity.slots(e.id)) {
        rejected.push({
          expert: e.id,
          reason: 'at_capacity',
          detail: `In-flight ${this.capacity.inFlight(e.id)} has reached the ${this.capacity.slots(e.id)}-slot allowance.`,
        });
        return false;
      }

      if (estimatedTokens > 0 && this.limiter.available(e.id) < estimatedTokens) {
        rejected.push({
          expert: e.id,
          reason: 'rate_limited',
          detail: `Needs ${estimatedTokens} tokens, ${this.limiter.available(e.id).toFixed(1)} available.`,
        });
        return false;
      }

      return true;
    });

    if (candidates.length === 0) {
      return {
        taskId: task.id,
        selected: null,
        alternates: [],
        rejected,
        scores: [],
        decidedAt: this.clock.now(),
        unroutableReason: dominantReason(rejected),
      };
    }

    // Exploration is decided once per task, not per expert, so a single
    // decision is either an exploration or an exploitation — never a blend
    // that is impossible to attribute afterwards.
    const coldStarters = candidates.filter((e) => e.coldStart);
    const exploring = coldStarters.length > 0 && this.rng.next() < this.cfg.explorationRate;

    const scores = candidates.map((e) => {
      const similarity = task.embedding
        ? (cosineSimilarity(task.embedding, e.embedding) + 1) / 2 // map [-1,1] -> [0,1]
        : capabilityOverlap(task.requires, e.capabilities);

      // A cold-start expert is scored at the midpoint rather than zero. Zero
      // is a claim we have not earned — we have no evidence it is bad, only no
      // evidence at all, and those must not rank the same.
      const trustWeight = e.coldStart ? 0.5 : e.earnedScore / BPS_MAX;
      const congestionPenalty = this.limiter.congestion(e.id);

      const final =
        this.cfg.similarityWeight * similarity +
        this.cfg.trustWeight * trustWeight -
        this.cfg.congestionWeight * congestionPenalty;

      return {
        expert: e.id,
        similarity,
        trustWeight,
        congestionPenalty,
        final,
        exploration: exploring && e.coldStart,
      };
    });

    // During exploration, cold-start experts sort ahead of everyone; within
    // each group the normal score decides. Ties break on expert id so a run is
    // reproducible regardless of input ordering.
    scores.sort((a, b) => {
      if (a.exploration !== b.exploration) return a.exploration ? -1 : 1;
      if (b.final !== a.final) return b.final - a.final;
      return a.expert < b.expert ? -1 : 1;
    });

    return {
      taskId: task.id,
      selected: scores[0].expert,
      alternates: scores.slice(1, 1 + this.cfg.alternatesCount).map((s) => s.expert),
      rejected,
      scores,
      decidedAt: this.clock.now(),
    };
  }
}

/** Fraction of required capabilities the expert holds, in 0..1. */
function capabilityOverlap(required: string[], held: string[]): number {
  if (required.length === 0) return 1;
  const heldSet = new Set(held);
  return required.filter((c) => heldSet.has(c)).length / required.length;
}

/**
 * The reason that blocked the most experts.
 *
 * Ties break by severity order rather than arbitrarily: `circuit_open` and
 * `at_capacity` are transient and actionable, `missing_capability` is a
 * modelling problem. Reporting the actionable one first is more useful to
 * whoever is paged.
 */
function dominantReason(rejections: Rejection[]): RejectionReason | 'no_candidates' {
  if (rejections.length === 0) return 'no_candidates';
  const order: RejectionReason[] = [
    'circuit_open',
    'at_capacity',
    'rate_limited',
    'below_trust_floor',
    'missing_capability',
    'excluded_by_caller',
  ];
  const counts = new Map<RejectionReason, number>();
  for (const r of rejections) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);

  let best: RejectionReason = rejections[0].reason;
  let bestCount = -1;
  for (const reason of order) {
    const c = counts.get(reason) ?? 0;
    if (c > bestCount) {
      bestCount = c;
      best = reason;
    }
  }
  return best;
}
