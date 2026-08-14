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
//
// STRANDED SLOTS — GIVING UP ON A CALL IS NOT THE SAME AS ENDING IT.
//
// `TimeoutPolicy` detects a hang and the caller stops waiting. What it CANNOT
// do is stop the expert: it holds no handle on the transport. So there are
// three dispositions for an acquired slot, not two:
//
//   release(e)  the call ended and we saw it end. The slot is free.
//   strand(e)   we gave up waiting. The call may well still be running on the
//               other side. The slot is NOT free.
//   reclaim(e)  the transport confirmed the work is dead, or a late result
//               finally arrived. Only now is the slot free.
//
// Collapsing `strand` into `release` is the phantom-slot bug: the governor
// believes a hung expert has room, the router admits more work to a process
// already stuck, and every metric stays green while the queue on the far side
// grows. It is the same shape as the rest of this codebase's recurring defect —
// a system reporting success it has not earned — and it is what the harness
// simulator itself did until this was added.
//
// `slots()` is deliberately NOT reduced by stranding. Slots are what the expert
// is judged capable of; stranding is a claim on that capability. Keeping them
// separate means `available()` can go to zero without the operator seeing a
// mysterious collapse in an expert's rated capacity.

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
  /** Slots given up on but not confirmed free. See the header. */
  stranded: number;
  consecutiveErrors: number;
  lastUpdatedAt: number;
}

export type CapacityHealth = 'warming' | 'healthy' | 'degraded';

export interface CapacityView {
  expert: ExpertId;
  slots: number;
  inFlight: number;
  /** Abandoned calls whose slots have not been confirmed free. */
  stranded: number;
  /** inFlight + stranded — what is actually claimed against `slots`. */
  committed: number;
  /** slots - committed, floored at 0. What the router may still admit. */
  available: number;
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
        stranded: 0,
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

  /**
   * Claim a slot. Refused when nothing is available.
   *
   * Availability is measured against `committed`, not `inFlight`, so a stranded
   * slot cannot be handed out twice. That single word is the phantom-slot fix.
   */
  acquire(expert: ExpertId): boolean {
    const s = this.stateFor(expert);
    if (this.committed(expert) >= this.slots(expert)) return false;
    s.inFlight += 1;
    return true;
  }

  /** The call ended and we saw it end. */
  release(expert: ExpertId): void {
    const s = this.stateFor(expert);
    s.inFlight = Math.max(0, s.inFlight - 1);
  }

  /**
   * We stopped waiting, but the call may still be running on the far side.
   *
   * The slot leaves `inFlight` — we are no longer awaiting it — and enters
   * `stranded`, where it keeps consuming the expert's allowance until
   * `reclaim` confirms it is really gone. A caller that calls `release` here
   * instead is asserting it watched the call die, which after a timeout it did
   * not.
   */
  strand(expert: ExpertId): void {
    const s = this.stateFor(expert);
    if (s.inFlight <= 0) return;
    s.inFlight -= 1;
    s.stranded += 1;
  }

  /**
   * The transport confirmed the abandoned work is dead, or a late result
   * finally arrived. Either way the slot is genuinely free now.
   *
   * Nothing here reclaims on a timer. A stranded slot that is never reclaimed
   * stays claimed forever and will starve the expert — which is the correct
   * failure direction (refuse work we cannot place) but is visible as a leak in
   * `stranded`, so it cannot be mistaken for healthy operation. A caller with
   * no way to confirm death must decide its own grace period and reclaim
   * explicitly; the governor will not invent one on its behalf.
   */
  reclaim(expert: ExpertId): void {
    const s = this.stateFor(expert);
    s.stranded = Math.max(0, s.stranded - 1);
  }

  inFlight(expert: ExpertId): number {
    return this.stateFor(expert).inFlight;
  }

  /** Slots given up on but not confirmed free. */
  stranded(expert: ExpertId): number {
    return this.stateFor(expert).stranded;
  }

  /** What is actually claimed against the allowance. */
  committed(expert: ExpertId): number {
    const s = this.stateFor(expert);
    return s.inFlight + s.stranded;
  }

  /** Headroom the router may still admit into. Never negative. */
  available(expert: ExpertId): number {
    return Math.max(0, this.slots(expert) - this.committed(expert));
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

    if (s.stranded > 0) {
      basis +=
        ` ${s.stranded} slot(s) stranded on abandoned calls that were never confirmed dead` +
        `, so only ${this.available(expert)} of ${this.slots(expert)} are admittable.`;
    }

    return {
      expert,
      slots: this.slots(expert),
      inFlight: s.inFlight,
      stranded: s.stranded,
      committed: this.committed(expert),
      available: this.available(expert),
      health,
      ewmaLatencyMs: s.ewmaLatencyMs,
      baselineLatencyMs: s.baselineLatencyMs,
      latencyRatio: ratio,
      basis,
    };
  }
}
