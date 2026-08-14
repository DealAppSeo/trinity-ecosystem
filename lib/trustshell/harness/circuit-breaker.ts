// lib/trustshell/harness/circuit-breaker.ts — per-expert breakers with fallback.
//
// "Wrap each agent in a circuit breaker that diverts traffic to a generalized
// LLM if the expert fails or degrades."
//
// Field names mirror Trinity's existing `circuit_breakers` table (state,
// failure_count, success_count, opened_at, half_open_at, threshold_failures,
// reset_timeout_minutes) so this can be persisted there without a translation
// layer inventing a second vocabulary for the same concept.
//
// Two design choices worth stating, because both are places breakers usually
// go wrong:
//
//   * HALF-OPEN ADMITS ONE PROBE AT A TIME. The common bug is letting the
//     whole backlog through the moment the reset timer fires, which
//     re-saturates an expert that has not recovered and immediately re-opens
//     the breaker. That oscillation reads as flapping infrastructure.
//   * A FALLBACK RESULT IS LABELLED. `viaFallback` rides on the result so a
//     caller can never mistake a generalist's answer for the expert's. An
//     unlabelled fallback silently degrades answer quality while every metric
//     stays green — the exact "silent degradation" failure this is meant to
//     catch.

import type { Clock, ExpertId } from '@/lib/trustshell/harness/types';

export type BreakerState = 'closed' | 'open' | 'half_open';

export interface BreakerConfig {
  /** Consecutive failures that trip a closed breaker. */
  thresholdFailures: number;
  /** How long an open breaker waits before admitting a probe. */
  resetTimeoutMs: number;
  /** Consecutive probe successes needed to close from half-open. */
  successesToClose: number;
}

interface BreakerRecord {
  state: BreakerState;
  failureCount: number;
  successCount: number;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
  openedAt: number | null;
  halfOpenAt: number | null;
  probeInFlight: boolean;
}

export interface BreakerView {
  expert: ExpertId;
  state: BreakerState;
  failureCount: number;
  successCount: number;
  openedAt: number | null;
  /** Why the breaker is in this state, in plain language. */
  basis: string;
}

export interface GuardedResult<T> {
  value: T;
  viaFallback: boolean;
  expert: ExpertId | 'fallback';
  attempts: number;
}

export class CircuitBreakerRegistry {
  private readonly records = new Map<ExpertId, BreakerRecord>();

  constructor(
    private readonly clock: Clock,
    private readonly cfg: BreakerConfig
  ) {
    if (cfg.thresholdFailures < 1) throw new Error('thresholdFailures must be >= 1');
    if (cfg.resetTimeoutMs <= 0) throw new Error('resetTimeoutMs must be > 0');
    if (cfg.successesToClose < 1) throw new Error('successesToClose must be >= 1');
  }

  private recordFor(expert: ExpertId): BreakerRecord {
    let r = this.records.get(expert);
    if (!r) {
      r = {
        state: 'closed',
        failureCount: 0,
        successCount: 0,
        lastFailureAt: null,
        lastSuccessAt: null,
        openedAt: null,
        halfOpenAt: null,
        probeInFlight: false,
      };
      this.records.set(expert, r);
    }
    return r;
  }

  /** Move an open breaker to half-open once its reset timeout has elapsed. */
  private maybeHalfOpen(r: BreakerRecord): void {
    if (r.state !== 'open' || r.openedAt === null) return;
    if (this.clock.now() - r.openedAt >= this.cfg.resetTimeoutMs) {
      r.state = 'half_open';
      r.halfOpenAt = this.clock.now();
      r.successCount = 0;
      r.probeInFlight = false;
    }
  }

  state(expert: ExpertId): BreakerState {
    const r = this.recordFor(expert);
    this.maybeHalfOpen(r);
    return r.state;
  }

  /** True when the expert must not receive traffic right now. */
  isOpen(expert: ExpertId): boolean {
    const r = this.recordFor(expert);
    this.maybeHalfOpen(r);
    if (r.state === 'open') return true;
    // Half-open admits exactly one probe; everyone else is turned away as if
    // open, which is what stops the backlog stampede described above.
    if (r.state === 'half_open' && r.probeInFlight) return true;
    return false;
  }

  /** Reserve the half-open probe slot. Returns false if already taken. */
  private claimProbe(r: BreakerRecord): boolean {
    if (r.state !== 'half_open') return true;
    if (r.probeInFlight) return false;
    r.probeInFlight = true;
    return true;
  }

  recordSuccess(expert: ExpertId): void {
    const r = this.recordFor(expert);
    this.maybeHalfOpen(r);
    r.lastSuccessAt = this.clock.now();
    r.probeInFlight = false;

    if (r.state === 'half_open') {
      r.successCount += 1;
      if (r.successCount >= this.cfg.successesToClose) {
        r.state = 'closed';
        r.failureCount = 0;
        r.openedAt = null;
        r.halfOpenAt = null;
      }
      return;
    }

    r.state = 'closed';
    r.failureCount = 0;
  }

  recordFailure(expert: ExpertId): void {
    const r = this.recordFor(expert);
    this.maybeHalfOpen(r);
    r.lastFailureAt = this.clock.now();
    r.failureCount += 1;
    r.probeInFlight = false;

    // A failed probe sends the breaker straight back to open. Counting it as
    // one more failure would let a flapping expert linger in half-open,
    // dribbling probes into a service that is plainly still broken.
    if (r.state === 'half_open' || r.failureCount >= this.cfg.thresholdFailures) {
      r.state = 'open';
      r.openedAt = this.clock.now();
      r.successCount = 0;
    }
  }

  /** Force a breaker open, e.g. from an out-of-band health signal. */
  trip(expert: ExpertId): void {
    const r = this.recordFor(expert);
    r.state = 'open';
    r.openedAt = this.clock.now();
    r.successCount = 0;
    r.probeInFlight = false;
  }

  reset(expert: ExpertId): void {
    this.records.delete(expert);
  }

  view(expert: ExpertId): BreakerView {
    const r = this.recordFor(expert);
    this.maybeHalfOpen(r);
    let basis: string;
    if (r.state === 'closed') {
      basis = `Closed. ${r.failureCount}/${this.cfg.thresholdFailures} consecutive failures.`;
    } else if (r.state === 'open') {
      const waited = r.openedAt === null ? 0 : this.clock.now() - r.openedAt;
      basis = `Open for ${waited}ms of the ${this.cfg.resetTimeoutMs}ms reset timeout.`;
    } else {
      basis = `Half-open. ${r.successCount}/${this.cfg.successesToClose} probe successes needed to close.${r.probeInFlight ? ' A probe is in flight.' : ''}`;
    }
    return {
      expert,
      state: r.state,
      failureCount: r.failureCount,
      successCount: r.successCount,
      openedAt: r.openedAt,
      basis,
    };
  }

  /**
   * Run `primary` under the breaker, diverting to `fallback` when it is open
   * or when the call fails.
   *
   * The result always names which path produced it. `fallback` returning a
   * value is a *success* for the request and says nothing about the expert —
   * so it deliberately does not record a success against the breaker.
   */
  async execute<T>(
    expert: ExpertId,
    primary: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<GuardedResult<T>> {
    const r = this.recordFor(expert);
    this.maybeHalfOpen(r);

    if (this.isOpen(expert) || !this.claimProbe(r)) {
      if (!fallback) throw new CircuitOpenError(expert, this.view(expert).basis);
      return { value: await fallback(), viaFallback: true, expert: 'fallback', attempts: 0 };
    }

    try {
      const value = await primary();
      this.recordSuccess(expert);
      return { value, viaFallback: false, expert, attempts: 1 };
    } catch (e) {
      this.recordFailure(expert);
      if (!fallback) throw e;
      return { value: await fallback(), viaFallback: true, expert: 'fallback', attempts: 1 };
    }
  }
}

export class CircuitOpenError extends Error {
  constructor(
    readonly expert: ExpertId,
    basis: string
  ) {
    super(`Circuit open for '${expert}' and no fallback was supplied. ${basis}`);
    this.name = 'CircuitOpenError';
    Object.setPrototypeOf(this, CircuitOpenError.prototype);
  }
}
