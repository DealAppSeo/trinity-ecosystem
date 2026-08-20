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
//
// EXPIRY IS NOT AN ENDING. This module cannot cancel anything; it holds no
// handle on the transport. So a swept attempt is not finished, it is
// ABANDONED — we stopped waiting, and the expert may still be working. Sweeping
// used to forget the attempt at that point, which quietly asserted the stronger
// claim: that giving up and the work ending are the same event. They are not,
// and the gap between them is where a hung expert keeps holding a capacity slot
// the governor thinks is free.
//
// So `sweep()` moves the attempt into an abandonment ledger, where it stays
// until the caller settles it:
//
//   settle(id, 'confirmed_dead')  the transport really killed it — the socket
//                                 closed, the subprocess reaped, the request
//                                 aborted and the abort landed.
//   settle(id, 'returned_late')   it came back after we stopped waiting. The
//                                 result is unusable (we already re-routed) but
//                                 the resource is genuinely free.
//   settle(id, 'presumed_dead')   we waited out a grace period and gave up on
//                                 ever knowing. An admission, not a confirmation.
//
// `unsettled()` is therefore a leak gauge: attempts nobody can account for. A
// caller that never settles will see it grow without bound, which is the point.
// The alternative — expiring the ledger on a timer — would make the leak
// invisible again, which is the failure mode this whole file exists to catch.

import type { Clock, ExpertId } from './types';

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

/**
 * How an abandoned attempt was finally accounted for.
 *
 * `presumed_dead` is deliberately not a synonym for `confirmed_dead`. One is an
 * observation, the other is a caller running out of patience — and a fleet
 * where most abandonments are presumed rather than confirmed has a transport
 * problem that a merged label would hide.
 */
export type AbandonDisposition = 'confirmed_dead' | 'returned_late' | 'presumed_dead';

export interface AbandonedAttempt {
  attempt: AttemptHandle;
  /** The expiry that caused the abandonment. */
  expiry: TimeoutKind;
  abandonedAt: number;
  /** How long the attempt had been alive when we gave up on it. */
  elapsedAtAbandonMs: number;
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
  /** Swept attempts awaiting a disposition. See the header. */
  private readonly abandoned = new Map<AttemptId, AbandonedAttempt>();
  private readonly settled: Record<AbandonDisposition, number> = {
    confirmed_dead: 0,
    returned_late: 0,
    presumed_dead: 0,
  };
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

  /**
   * Mark an attempt finished. Returns its duration, or null if unknown.
   *
   * An attempt that was already swept still completes here — that is an expert
   * returning after we stopped waiting, and it is exactly the evidence that
   * frees its stranded slot. Silently returning null for it would leave the
   * abandonment unsettled forever and make a recovered expert look like a leak.
   */
  complete(id: AttemptId): number | null {
    const a = this.attempts.get(id);
    if (a) {
      this.attempts.delete(id);
      return this.clock.now() - a.startedAt;
    }
    const ab = this.abandoned.get(id);
    if (ab) {
      this.settle(id, 'returned_late');
      return this.clock.now() - (ab.abandonedAt - ab.elapsedAtAbandonMs);
    }
    return null;
  }

  /**
   * Account for an abandoned attempt.
   *
   * Returns false for an unknown id, for an attempt still in flight, and for
   * one already settled — a caller must never read a double-settle as having
   * freed a second resource.
   */
  settle(id: AttemptId, disposition: AbandonDisposition): boolean {
    if (!this.abandoned.delete(id)) return false;
    this.settled[disposition] += 1;
    return true;
  }

  /** Abandoned attempts nobody has accounted for yet. A leak gauge. */
  unsettled(): AbandonedAttempt[] {
    return [...this.abandoned.values()];
  }

  /** How many abandoned attempts are still unaccounted for. */
  unsettledCount(): number {
    return this.abandoned.size;
  }

  /** Unsettled abandonments for one expert — what is stranding its slots. */
  unsettledFor(expert: ExpertId): number {
    let n = 0;
    for (const a of this.abandoned.values()) if (a.attempt.expert === expert) n += 1;
    return n;
  }

  /** Counts by disposition, for the confirmed-vs-presumed ratio. */
  dispositions(): Record<AbandonDisposition, number> {
    return { ...this.settled };
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
   * Report every breached attempt and move it to the abandonment ledger.
   *
   * Moving out of `attempts` is what makes this idempotent: an expiry is
   * surfaced exactly once, so a caller polling in a loop cannot double-count one
   * hang as a run of failures and trip a breaker on a single incident.
   *
   * It moves rather than deletes because the work is not over — see the header.
   */
  sweep(): TimeoutExpiry[] {
    const expired: TimeoutExpiry[] = [];
    for (const a of this.attempts.values()) {
      const e = this.expiryFor(a);
      if (e) expired.push(e);
    }
    const now = this.clock.now();
    for (const e of expired) {
      this.attempts.delete(e.attempt.id);
      this.abandoned.set(e.attempt.id, {
        attempt: e.attempt,
        expiry: e.kind,
        abandonedAt: now,
        elapsedAtAbandonMs: e.elapsedMs,
      });
    }
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
