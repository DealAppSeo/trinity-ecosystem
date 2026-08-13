// lib/trustshell/harness/capacity.ts — dynamic capacity from observed latency.
//
// Fixes two named MoE failures at once:
//
//   "Dynamically adjust the maximum number of active slots per agent based on
//    real-time API latency measurements."
//   "Silent expert degradation: an agent can start outputting low-quality data
//    or broken tool calls without crashing the master router."
//
// A static concurrency limit is wrong in both directions: too low and a fast
// expert idles, too high and a degrading one accumulates a queue that shows up
// as system-wide latency long before anything errors.
//
// Latency is tracked as an EWMA against a baseline established while the
// expert is healthy. The ratio observed/baseline drives slots. Crucially the
// baseline is *not* re-learned while degraded — otherwise an expert that slows
// down permanently teaches the harness that slow is normal, and the degradation
// becomes invisible. That is the failure this file exists to catch, so the
// mechanism must not launder it.

import type { Clock, ExpertId } from '@/lib/trustshell/harness/types';

export interface CapacityConfig {
  /** Slots when the expert is at its healthy baseline. */
  baseSlots: number;
  /** Never drop below this, so a degraded expert can still prove recovery. */
  minSlots: number;
  /** Never exceed this regardless of how fast the expert looks. */
  maxSlots: number;
  /** EWMA smoothing, 0..1. Higher reacts faster and is noisier. */
  alpha?: number;
  /** Samples required before the baseline is trusted. */
  warmupSamples?: number;
  /** Ratio above baseline that counts as degraded. */
  degradedRatio?: number;
}

const DEFAULTS = { alpha: 0.3, warmupSamples: 5, degradedRatio: 1.5 };

interface ExpertCapacity {
  ewmaLatencyMs: number | null;
  baselineLatencyMs: number | null;
  samples: number;
  inFlight: number;
  consecutiveErrors: number;
  lastUpdatedAt: number;
}

export type CapacityHealth = 'warming' | 'healthy' | 'degraded';

export interface CapacityView {
  expert: ExpertId;
  slots: number;
  inFlight: number;
  health: CapacityHealth;
  ewmaLatencyMs: number | null;
  baselineLatencyMs: number | null;
  latencyRatio: number | null;
  /** Why this expert has the slot count it has. */
  basis: string;
}

export class CapacityGovernor {
  private readonly state = new Map<ExpertId, ExpertCapacity>();
  private readonly cfg: Required<CapacityConfig>;

  constructor(
    private readonly clock: Clock,
    config: CapacityConfig
  ) {
    if (config.minSlots < 1) throw new Error('minSlots must be >= 1');
    if (config.maxSlots < config.minSlots) throw new Error('maxSlots must be >= minSlots');
    if (config.baseSlots < config.minSlots || config.baseSlots > config.maxSlots) {
      throw new Error('baseSlots must lie within [minSlots, maxSlots]');
    }
    this.cfg = { ...DEFAULTS, ...config };
    if (this.cfg.alpha <= 0 || this.cfg.alpha > 1) throw new Error('alpha must be in (0, 1]');
  }

  private stateFor(expert: ExpertId): ExpertCapacity {
    let s = this.state.get(expert);
    if (!s) {
      s = {
        ewmaLatencyMs: null,
        baselineLatencyMs: null,
        samples: 0,
        inFlight: 0,
        consecutiveErrors: 0,
        lastUpdatedAt: this.clock.now(),
      };
      this.state.set(expert, s);
    }
    return s;
  }

  /** Record a completed call. `ok=false` counts toward consecutive errors. */
  observe(expert: ExpertId, latencyMs: number, ok = true): void {
    if (latencyMs < 0) throw new Error('latencyMs must be >= 0');
    const s = this.stateFor(expert);
    s.samples += 1;
    s.lastUpdatedAt = this.clock.now();
    s.consecutiveErrors = ok ? 0 : s.consecutiveErrors + 1;

    s.ewmaLatencyMs =
      s.ewmaLatencyMs === null
        ? latencyMs
        : this.cfg.alpha * latencyMs + (1 - this.cfg.alpha) * s.ewmaLatencyMs;

    // Freeze the baseline once warm. Re-learning it while degraded would
    // normalise the degradation and hide exactly what we are watching for.
    if (s.baselineLatencyMs === null && s.samples >= this.cfg.warmupSamples) {
      s.baselineLatencyMs = s.ewmaLatencyMs;
    }
  }

  /** Explicitly re-baseline, e.g. after a deliberate model or hardware change. */
  rebaseline(expert: ExpertId): void {
    const s = this.stateFor(expert);
    s.baselineLatencyMs = s.ewmaLatencyMs;
  }

  acquire(expert: ExpertId): boolean {
    const s = this.stateFor(expert);
    if (s.inFlight >= this.slots(expert)) return false;
    s.inFlight += 1;
    return true;
  }

  release(expert: ExpertId): void {
    const s = this.stateFor(expert);
    s.inFlight = Math.max(0, s.inFlight - 1);
  }

  inFlight(expert: ExpertId): number {
    return this.stateFor(expert).inFlight;
  }

  health(expert: ExpertId): CapacityHealth {
    const s = this.stateFor(expert);
    if (s.baselineLatencyMs === null || s.ewmaLatencyMs === null) return 'warming';
    if (s.consecutiveErrors >= 3) return 'degraded';
    return s.ewmaLatencyMs > s.baselineLatencyMs * this.cfg.degradedRatio ? 'degraded' : 'healthy';
  }

  /**
   * Current slot allowance.
   *
   * Slots scale inversely with the latency ratio: an expert running at 2x its
   * baseline gets about half its slots. Errors shrink it further, because a
   * failing expert should be given less traffic while it is being observed,
   * not the same amount until a breaker trips.
   */
  slots(expert: ExpertId): number {
    const s = this.stateFor(expert);
    const { baseSlots, minSlots, maxSlots } = this.cfg;

    if (s.baselineLatencyMs === null || s.ewmaLatencyMs === null) {
      // Warming up: allow the base allocation so the expert can generate the
      // samples it needs. Starving it here is a cold-start trap.
      return baseSlots;
    }

    const ratio = s.ewmaLatencyMs / Math.max(1, s.baselineLatencyMs);
    let slots = baseSlots / Math.max(1, ratio);

    if (s.consecutiveErrors > 0) {
      slots = slots / (1 + s.consecutiveErrors);
    }

    return Math.max(minSlots, Math.min(maxSlots, Math.floor(slots) || minSlots));
  }

  view(expert: ExpertId): CapacityView {
    const s = this.stateFor(expert);
    const health = this.health(expert);
    const ratio =
      s.baselineLatencyMs && s.ewmaLatencyMs ? s.ewmaLatencyMs / s.baselineLatencyMs : null;

    let basis: string;
    if (health === 'warming') {
      basis = `Warming: ${s.samples}/${this.cfg.warmupSamples} samples before a baseline exists. Slots held at base.`;
    } else if (health === 'degraded' && s.consecutiveErrors >= 3) {
      basis = `Degraded on ${s.consecutiveErrors} consecutive errors.`;
    } else if (health === 'degraded') {
      basis = `Degraded: latency ${ratio?.toFixed(2)}x baseline, over the ${this.cfg.degradedRatio}x threshold.`;
    } else {
      basis = `Healthy: latency ${ratio?.toFixed(2)}x baseline.`;
    }

    return {
      expert,
      slots: this.slots(expert),
      inFlight: s.inFlight,
      health,
      ewmaLatencyMs: s.ewmaLatencyMs,
      baselineLatencyMs: s.baselineLatencyMs,
      latencyRatio: ratio,
      basis,
    };
  }
}
