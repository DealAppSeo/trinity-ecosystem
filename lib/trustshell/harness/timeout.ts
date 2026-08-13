// lib/trustshell/harness/timeout.ts — the run/idle timeout split.
//
// "Implement both a run timeout (total wall clock) and an idle timeout (no
//  observable progress), refreshed by heartbeats."
//
// This is the only mechanism in the harness that catches an expert which HANGS
// WITHOUT ERRORING, and nothing else here can substitute for it:
//
//   * `CircuitBreakerRegistry` only ever learns from `recordFailure`. A hang
//     produces no failure, so the breaker stays closed forever.
//   * `CapacityGovernor.observe` is called on completion. A hang never
//     completes, so the latency EWMA is never updated — the expert's last
//     observed latency stays healthy and it keeps its full slot allocation.
//   * `ReputationLedger` learns from outcomes. A hang has no outcome.
//
// So a hanging expert is invisible to every other layer, holds a slot
// indefinitely, and continues to be routed to. The timeout is what manufactures
// the failure signal the rest of the harness already knows how to consume.
//
// WHY THE SPLIT IS TWO NUMBERS AND NOT ONE. A single wall-clock timeout has to
// be set long enough for the slowest legitimate task, which makes it far too
// long to detect a hang promptly. The idle deadline can be short because it
// measures time since the last observed progress rather than total duration, so
// a legitimately long task refreshes it and a hung one does not.
//
// WHY THE RUN DEADLINE IS NOT REFRESHABLE. A heartbeat is self-report — the same
// category of evidence this harness refuses to rank experts on. An expert that
// emits keepalives while making no real progress would live forever under an
// idle deadline alone. The run deadline is the earned bound: it cannot be talked
// out of firing. Keeping both is the point; a heartbeat that could extend the
// run deadline would quietly collapse this back into one number.
//
// NO TIMERS. Expiry is detected by polling `sweep()`, not by `setTimeout`. The
// portability check forbids runtime globals, and a poll-based design is exactly
// reproducible under an injected clock — a timer-based one is not testable
// without real elapsed time.

import type { Clock, ExpertId } from '@/lib/trustshell/harness/types';

/**
 * Which deadline fired.
 *
 * Kept distinct because they carry different operational meanings and call for
 * different responses: `idle` means the expert stopped responding mid-flight
 * and is a candidate for the breaker; `run` means the work legitimately took
 * too long and may only need a larger budget. Collapsing them into a single
 * "timeout" throws away that attribution — the same argument as labelling a
 * fallback result in `circuit-breaker.ts`.
 */
export type TimeoutKind = 'run' | 'idle';

export interface TimeoutConfig {
  /** Hard cap on one attempt's total wall clock. Heartbeats do NOT extend it. */
  runTimeoutMs: number;
  /** Cap on time since the last observed progress. Heartbeats DO extend it. */
  idleTimeoutMs: number;
}

export type AttemptId = string;

export interface AttemptHandle {
  id: AttemptId;
  expert: ExpertId;
  taskId: string;
}

interface AttemptRecord {
  id: AttemptId;
  expert: ExpertId;
  taskId: string;
  startedAt: number;
  lastProgressAt: number;
  heartbeats: number;
  lastNote: string | null;
}

export interface TimeoutExpiry {
  attempt: AttemptHandle;
  kind: TimeoutKind;
  /** Total wall clock the attempt was alive for. */
  elapsedMs: number;
  /** Time since the last observed progress. */
  idleMs: number;
  /** How many progress signals arrived before it stalled. */
  heartbeats: number;
  /** The last thing the expert was seen doing, if the caller named it. */
  lastNote: string | null;
  /** Why this attempt expired, in plain language. */
  basis: string;
}

export interface AttemptView {
  attempt: AttemptHandle;
  startedAt: number;
  elapsedMs: number;
  idleMs: number;
  heartbeats: number;
  /** Ms until the run deadline. Negative once breached. */
  runRemainingMs: number;
  /** Ms until the idle deadline. Negative once breached. */
  idleRemainingMs: number;
  expired: TimeoutKind | null;
}

/**
 * Tracks in-flight attempts and reports the ones that have breached a deadline.
 *
 * The policy does not cancel anything — it cannot, since it has no handle on
 * the underlying call. It reports expiry; the caller decides what abandonment
 * means in its own transport. That keeps this module free of any assumption
 * about promises, sockets, or subprocesses, which is what lets it stay portable.
 */
export class TimeoutPolicy {
  private readonly attempts = new Map<AttemptId, AttemptRecord>();
  /** Monotonic, so attempt ids are deterministic. No Math.random here. */
  private seq = 0;

  constructor(
    private readonly clock: Clock,
    private readonly cfg: TimeoutConfig
  ) {
    if (cfg.runTimeoutMs <= 0) throw new Error('runTimeoutMs must be > 0');
    if (cfg.idleTimeoutMs <= 0) throw new Error('idleTimeoutMs must be > 0');
    // Idle time can never exceed elapsed time, so an idle deadline beyond the
    // run deadline is unreachable — the run deadline would always fire first.
    // That is a silently dead mechanism rather than a harmless setting, and a
    // dead hang-detector is precisely the failure this file exists to prevent.
    if (cfg.idleTimeoutMs > cfg.runTimeoutMs) {
      throw new Error(
        'idleTimeoutMs must be <= runTimeoutMs, otherwise the idle deadline is unreachable ' +
          'and hang detection is silently disabled'
      );
    }
  }

  /** Register an attempt as in flight. */
  begin(expert: ExpertId, taskId: string): AttemptHandle {
    this.seq += 1;
    const id = `${taskId}#${this.seq}`;
    const now = this.clock.now();
    this.attempts.set(id, {
      id,
      expert,
      taskId,
      startedAt: now,
      lastProgressAt: now,
      heartbeats: 0,
      lastNote: null,
    });
    return { id, expert, taskId };
  }

  /**
   * Record observable progress, refreshing the idle deadline only.
   *
   * `note` should name what actually progressed — a token batch, a completed
   * sub-step, a streamed chunk. A heartbeat fired by a timer rather than by
   * output defeats the idle deadline entirely, which is why the run deadline
   * exists and why this asks the caller to say what it saw.
   *
   * Returns false for an unknown or already-swept attempt, so a caller cannot
   * mistake a heartbeat against a dead attempt for a live one.
   */
  heartbeat(id: AttemptId, note?: string): boolean {
    const a = this.attempts.get(id);
    if (!a) return false;
    a.lastProgressAt = this.clock.now();
    a.heartbeats += 1;
    if (note !== undefined) a.lastNote = note;
    return true;
  }

  /** Mark an attempt finished. Returns its duration, or null if unknown. */
  complete(id: AttemptId): number | null {
    const a = this.attempts.get(id);
    if (!a) return null;
    this.attempts.delete(id);
    return this.clock.now() - a.startedAt;
  }

  private expiryFor(a: AttemptRecord): TimeoutExpiry | null {
    const now = this.clock.now();
    const elapsedMs = now - a.startedAt;
    const idleMs = now - a.lastProgressAt;

    const runBreached = elapsedMs >= this.cfg.runTimeoutMs;
    const idleBreached = idleMs >= this.cfg.idleTimeoutMs;
    if (!runBreached && !idleBreached) return null;

    // When both have breached, attribute to whichever deadline came first in
    // wall-clock terms. Reporting the wrong one would misdirect the operator:
    // "ran too long" and "stopped responding" prompt different fixes.
    let kind: TimeoutKind;
    if (runBreached && idleBreached) {
      const runDeadline = a.startedAt + this.cfg.runTimeoutMs;
      const idleDeadline = a.lastProgressAt + this.cfg.idleTimeoutMs;
      kind = idleDeadline <= runDeadline ? 'idle' : 'run';
    } else {
      kind = runBreached ? 'run' : 'idle';
    }

    const basis =
      kind === 'idle'
        ? `No observable progress for ${idleMs}ms, over the ${this.cfg.idleTimeoutMs}ms idle deadline` +
          ` (${a.heartbeats} heartbeat(s) before it stalled${a.lastNote ? `, last: ${a.lastNote}` : ''}).`
        : `Ran ${elapsedMs}ms, over the ${this.cfg.runTimeoutMs}ms run deadline` +
          ` (${a.heartbeats} heartbeat(s); still making progress ${idleMs}ms ago).`;

    return {
      attempt: { id: a.id, expert: a.expert, taskId: a.taskId },
      kind,
      elapsedMs,
      idleMs,
      heartbeats: a.heartbeats,
      lastNote: a.lastNote,
      basis,
    };
  }

  /** Test one attempt without removing it. Null if unknown or still live. */
  check(id: AttemptId): TimeoutExpiry | null {
    const a = this.attempts.get(id);
    if (!a) return null;
    return this.expiryFor(a);
  }

  /**
   * Report every breached attempt and drop it.
   *
   * Dropping is what makes this idempotent: an expiry is surfaced exactly once,
   * so a caller polling in a loop cannot double-count one hang as a run of
   * failures and trip a breaker on a single incident.
   */
  sweep(): TimeoutExpiry[] {
    const expired: TimeoutExpiry[] = [];
    for (const a of this.attempts.values()) {
      const e = this.expiryFor(a);
      if (e) expired.push(e);
    }
    for (const e of expired) this.attempts.delete(e.attempt.id);
    return expired;
  }

  /** Number of attempts currently in flight. */
  inFlight(): number {
    return this.attempts.size;
  }

  /** In-flight attempts for one expert. */
  inFlightFor(expert: ExpertId): number {
    let n = 0;
    for (const a of this.attempts.values()) if (a.expert === expert) n += 1;
    return n;
  }

  view(id: AttemptId): AttemptView | null {
    const a = this.attempts.get(id);
    if (!a) return null;
    const now = this.clock.now();
    const elapsedMs = now - a.startedAt;
    const idleMs = now - a.lastProgressAt;
    const e = this.expiryFor(a);
    return {
      attempt: { id: a.id, expert: a.expert, taskId: a.taskId },
      startedAt: a.startedAt,
      elapsedMs,
      idleMs,
      heartbeats: a.heartbeats,
      runRemainingMs: this.cfg.runTimeoutMs - elapsedMs,
      idleRemainingMs: this.cfg.idleTimeoutMs - idleMs,
      expired: e ? e.kind : null,
    };
  }
}

/**
 * Thrown when a caller wants an expiry to propagate as an error.
 *
 * `kind` rides on the error for the same reason `viaFallback` rides on a
 * guarded result: a caller must never have to guess whether a timeout meant
 * "hung" or "slow".
 */
export class AttemptTimeoutError extends Error {
  constructor(readonly expiry: TimeoutExpiry) {
    super(
      `Attempt '${expiry.attempt.id}' on expert '${expiry.attempt.expert}' hit the ` +
        `${expiry.kind} deadline. ${expiry.basis}`
    );
    this.name = 'AttemptTimeoutError';
    Object.setPrototypeOf(this, AttemptTimeoutError.prototype);
  }
}
