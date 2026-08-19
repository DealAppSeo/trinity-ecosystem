// lib/trustshell/harness/retry.ts — the retry_on predicate, and a schedule that
// cannot sleep.
//
// "RetryPolicy — initial interval, backoff factor, max interval, jitter, and a
//  `retry_on` PREDICATE rather than an exception list."
//
// The predicate is the whole point, and it is the last thing on the LangGraph
// list that this harness had not taken (`TRUST-HARNESS.md`, "What came from
// where"; the run/idle split, the replay semantics and the message transforms
// were already built).
//
// ── WHY A PREDICATE AND NOT A LIST OF ERROR TYPES ────────────────────────────
//
// A list keys on the SHAPE of a failure. Retryability is a property of the
// SITUATION. The same class arrives in both flavours constantly — one HTTP error
// type covers 429 (retry, the server said so) and 400 (never; the request is
// wrong and will be wrong again). A type list cannot separate those without
// inventing a subtype per status, and every such taxonomy goes stale the moment
// a transport is swapped.
//
// A predicate sees the failure AND its context — which attempt this is, how long
// the work has been alive, which expert produced it — so the caller can express
// "retry an idle timeout but not a run timeout", which is a distinction no error
// class carries.
//
// ── THE FAILURE THIS CLOSES ──────────────────────────────────────────────────
//
// A retry that cannot tell "this will never succeed" from "this might" converts
// one permanent error into N identical permanent errors, N times the cost, and
// N times the latency before the caller learns what it already could have known
// on the first failure. It also looks like resilience while it happens, which is
// why it survives review: the logs fill with retries, the system appears to be
// trying hard, and the outcome was decided before the first backoff.
//
// ── NO DEFAULT PREDICATE, DELIBERATELY ───────────────────────────────────────
//
// `retryOn` is REQUIRED. There is no catch-all default, and that is not an
// oversight:
//
//   * a default of "retry everything unknown" is the failure above, shipped;
//   * a default of "retry nothing unknown" is a policy that silently makes the
//     whole module a no-op for every error this codebase has not classified.
//
// This repo has no error taxonomy yet — `TRUST-HARNESS.md` records the
// control-flow-vs-failure separation as taken from LangGraph's `errors.py`, and
// as of 2026-08-16 only `AttemptTimeoutError` exists. Guessing a default here
// would be a guess wearing a policy's clothes, the same reason
// `contracted-evaluator.ts` ships `maxDisagreement` with no default. What IS
// offered is `retryIdleTimeoutsOnly` below: a named, documented building block
// for the one distinction this harness can actually attribute today.
//
// ── NO SLEEPING, AND NO TIMERS ───────────────────────────────────────────────
//
// `decide()` returns a delay; it never waits. Same reasoning as `timeout.ts`:
// a poll-or-schedule design driven by an injected clock is exactly reproducible
// in a test, and a `setTimeout` design is not testable without real elapsed
// time. Jitter draws from an injected `Rng` for the same reason — a schedule
// that calls `Math.random()` cannot be asserted on.

import type { Rng } from '@/lib/trustshell/harness/router';
import { AttemptTimeoutError } from '@/lib/trustshell/harness/timeout';
import type { Clock, ExpertId } from '@/lib/trustshell/harness/types';

/**
 * What the caller knows at the moment a failure arrives.
 *
 * `attempt` is 1-based and counts the attempt that JUST FAILED, so the first
 * failure arrives as `attempt: 1`. Off-by-one here is the difference between
 * `maxAttempts: 3` meaning three tries and meaning four.
 */
export interface FailureContext {
  /** Whatever the transport threw. Unknown by design — the predicate narrows it. */
  readonly error: unknown;
  /** 1-based index of the attempt that just failed. */
  readonly attempt: number;
  /** Wall clock since the FIRST attempt began, not since this one. */
  readonly elapsedMs: number;
  /** Which expert produced the failure, when the caller tracks that. */
  readonly expert?: ExpertId;
}

/**
 * The `retry_on` predicate. True means "this failure could succeed if tried
 * again"; it does NOT mean "retry now" — budget is checked separately.
 */
export type RetryPredicate = (failure: FailureContext) => boolean;

/**
 * Three outcomes, and they are three rather than two on purpose.
 *
 * `not_retryable` and `exhausted` are different facts about the world and call
 * for different responses: the first says the request itself is wrong and a
 * bigger budget changes nothing; the second says the budget ran out and a bigger
 * one might have worked. Collapsing them into "gave up" throws away the
 * attribution — the same argument `timeout.ts` makes for keeping run and idle
 * distinct, and `circuit-breaker.ts` for labelling fallbacks.
 */
export type RetryDecision =
  | { readonly kind: 'retry'; readonly attempt: number; readonly delayMs: number }
  | { readonly kind: 'not_retryable'; readonly attempt: number; readonly reason: string }
  | { readonly kind: 'exhausted'; readonly attempts: number };

export interface RetryConfig {
  /** TOTAL attempts including the first. `1` disables retrying without disabling this module. */
  readonly maxAttempts: number;
  /** Delay after the first failure, before backoff is applied. */
  readonly initialDelayMs: number;
  /** Multiplier per attempt. `1` gives a constant delay. */
  readonly backoffFactor: number;
  /** Ceiling on the computed delay, applied BEFORE jitter. */
  readonly maxDelayMs: number;
  /**
   * Fraction of the delay to randomise, in [0, 1]. `0.2` spreads a 1000ms delay
   * over 800–1200ms. Zero is a legitimate setting and makes the schedule fully
   * deterministic, which is what most of the tests use.
   */
  readonly jitter: number;
  /** REQUIRED. See the header for why there is no default. */
  readonly retryOn: RetryPredicate;
}

/**
 * Retry an IDLE timeout, never a RUN timeout.
 *
 * The distinction is the one `timeout.ts` went out of its way to preserve, and
 * this is the first thing to actually consume it:
 *
 *   idle — the expert stopped producing observable progress. Another attempt,
 *          very possibly on another expert, is a reasonable bet.
 *   run  — the work was alive and progressing and still exceeded its total
 *          budget. Retrying spends another full budget to arrive at the same
 *          wall. That is not resilience, it is the same failure at twice the
 *          price.
 *
 * Anything that is not an `AttemptTimeoutError` returns false: this predicate
 * makes a claim about timeouts only, and answering for errors it cannot classify
 * would be the guessed default the header refuses. Compose it rather than
 * extend it.
 */
export const retryIdleTimeoutsOnly: RetryPredicate = (failure) =>
  failure.error instanceof AttemptTimeoutError && failure.error.expiry.kind === 'idle';

export class RetryPolicy {
  constructor(
    private readonly clock: Clock,
    private readonly rng: Rng,
    private readonly cfg: RetryConfig
  ) {
    // Bounds are rejected at construction rather than clamped at use. A clamped
    // config is a config that lies about what it will do, and the caller never
    // finds out.
    if (!Number.isFinite(cfg.maxAttempts) || cfg.maxAttempts < 1) {
      throw new Error('maxAttempts must be >= 1');
    }
    if (!Number.isFinite(cfg.initialDelayMs) || cfg.initialDelayMs < 0) {
      throw new Error('initialDelayMs must be >= 0');
    }
    if (!Number.isFinite(cfg.backoffFactor) || cfg.backoffFactor < 1) {
      throw new Error('backoffFactor must be >= 1 — a shrinking delay retries a busy dependency harder');
    }
    if (!Number.isFinite(cfg.maxDelayMs) || cfg.maxDelayMs < 0) {
      throw new Error('maxDelayMs must be >= 0');
    }
    if (!Number.isFinite(cfg.jitter) || cfg.jitter < 0 || cfg.jitter > 1) {
      throw new Error('jitter must be within [0, 1]');
    }
    if (typeof cfg.retryOn !== 'function') {
      throw new Error('retryOn is required — there is no safe default; see the header');
    }
  }

  /**
   * Classify a failure. Pure apart from the clock and rng reads, and it never
   * waits — the caller owns scheduling.
   *
   * THE PREDICATE IS ASKED FIRST, and the order is load-bearing. Checking the
   * budget first would report a permanent error that happened to arrive on the
   * final attempt as `exhausted`, which reads as bad luck and sends the reader
   * looking for more budget instead of at the request that can never succeed.
   * Attribution is the reason this module has three outcomes; spending it on
   * argument order would be a poor trade.
   */
  decide(failure: FailureContext): RetryDecision {
    if (!this.cfg.retryOn(failure)) {
      return {
        kind: 'not_retryable',
        attempt: failure.attempt,
        reason: 'retryOn predicate declined this failure',
      };
    }
    if (failure.attempt >= this.cfg.maxAttempts) {
      return { kind: 'exhausted', attempts: failure.attempt };
    }
    return {
      kind: 'retry',
      attempt: failure.attempt + 1,
      delayMs: this.delayFor(failure.attempt),
    };
  }

  /**
   * Delay before the attempt that follows `attempt`.
   *
   * The cap is applied BEFORE jitter so that `maxDelayMs` bounds the schedule
   * rather than the pre-jitter input to it — capping afterwards would let a
   * jittered value sit above a ceiling the caller believes is absolute.
   */
  delayFor(attempt: number): number {
    const raw = this.cfg.initialDelayMs * Math.pow(this.cfg.backoffFactor, Math.max(0, attempt - 1));
    const capped = Math.min(raw, this.cfg.maxDelayMs);
    if (this.cfg.jitter === 0) return capped;
    // Symmetric: [capped * (1 - jitter), capped * (1 + jitter)], floored at 0.
    // `next()` is expected in [0, 1); anything outside that would push the delay
    // outside the band, so it is clamped rather than trusted.
    const unit = Math.min(1, Math.max(0, this.rng.next()));
    const spread = capped * this.cfg.jitter;
    return Math.max(0, capped - spread + unit * 2 * spread);
  }

  /** Exposed so a caller can record when it decided, without reaching for a global. */
  now(): number {
    return this.clock.now();
  }
}
