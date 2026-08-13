// lib/trustshell/harness/leaky-bucket.ts — per-expert token rate limiting.
//
// Fixes the first named MoE failure: "Routers can over-assign tasks to popular
// expert agents, causing severe latency spikes while other capable agents sit
// idle." A router that ranks purely on fit will pile every task onto the
// best-scoring expert until it collapses, and the collapse looks like a
// latency problem rather than a routing problem.
//
// This is the standard token bucket, refilled continuously rather than on a
// timer. Continuous refill matters here: a tick-based refill lets a burst
// arrive just after a tick and stall for the remainder of the interval, which
// shows up as a latency spike that no metric attributes to the limiter.

import type { Clock, ExpertId } from '@/lib/trustshell/harness/types';

export interface BucketConfig {
  /** Sustained rate. Tokens replenished per minute. */
  tokensPerMinute: number;
  /**
   * Maximum tokens the bucket may hold — the burst allowance.
   * Defaults to one minute's worth, i.e. no extra burst headroom.
   */
  burstCapacity?: number;
}

interface BucketState {
  tokens: number;
  lastRefillAt: number;
  capacity: number;
  ratePerMs: number;
}

export interface AdmissionResult {
  admitted: boolean;
  /** Tokens left after the charge, or currently available if refused. */
  remaining: number;
  /** When enough tokens will exist, if refused. Absent when admitted. */
  retryAfterMs?: number;
}

/**
 * Token buckets keyed by expert.
 *
 * Deliberately not a general-purpose rate limiter: `tryConsume` charges and
 * admits in one step so a caller cannot check-then-charge and race itself.
 */
export class LeakyBucketLimiter {
  private readonly buckets = new Map<ExpertId, BucketState>();

  constructor(
    private readonly clock: Clock,
    private readonly defaults: BucketConfig
  ) {
    if (defaults.tokensPerMinute <= 0) {
      throw new Error('tokensPerMinute must be > 0');
    }
  }

  /** Set or replace an expert's limit. Existing tokens are clamped, not reset. */
  configure(expert: ExpertId, config: BucketConfig): void {
    if (config.tokensPerMinute <= 0) throw new Error('tokensPerMinute must be > 0');
    const capacity = config.burstCapacity ?? config.tokensPerMinute;
    const existing = this.buckets.get(expert);
    this.buckets.set(expert, {
      // A reconfigure must not hand out free capacity: keep what is there,
      // clamped down if the new ceiling is lower.
      tokens: existing ? Math.min(existing.tokens, capacity) : capacity,
      lastRefillAt: this.clock.now(),
      capacity,
      ratePerMs: config.tokensPerMinute / 60_000,
    });
  }

  private bucketFor(expert: ExpertId): BucketState {
    let bucket = this.buckets.get(expert);
    if (!bucket) {
      const capacity = this.defaults.burstCapacity ?? this.defaults.tokensPerMinute;
      bucket = {
        tokens: capacity,
        lastRefillAt: this.clock.now(),
        capacity,
        ratePerMs: this.defaults.tokensPerMinute / 60_000,
      };
      this.buckets.set(expert, bucket);
    }
    return bucket;
  }

  private refill(bucket: BucketState): void {
    const now = this.clock.now();
    const elapsed = now - bucket.lastRefillAt;
    // A clock that goes backwards must not drain the bucket. Treat it as no
    // elapsed time and re-anchor, rather than adding a negative refill.
    if (elapsed <= 0) {
      bucket.lastRefillAt = now;
      return;
    }
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.ratePerMs);
    bucket.lastRefillAt = now;
  }

  /** Tokens currently available, after refilling to now. */
  available(expert: ExpertId): number {
    const bucket = this.bucketFor(expert);
    this.refill(bucket);
    return bucket.tokens;
  }

  /**
   * Charge `tokens` against the expert's bucket.
   *
   * A request larger than the bucket's entire capacity can never be admitted;
   * it is refused with no retry time rather than being queued forever, because
   * waiting cannot help.
   */
  tryConsume(expert: ExpertId, tokens: number): AdmissionResult {
    if (tokens < 0) throw new Error('tokens must be >= 0');
    const bucket = this.bucketFor(expert);
    this.refill(bucket);

    if (tokens > bucket.capacity) {
      return { admitted: false, remaining: bucket.tokens };
    }

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return { admitted: true, remaining: bucket.tokens };
    }

    const deficit = tokens - bucket.tokens;
    return {
      admitted: false,
      remaining: bucket.tokens,
      retryAfterMs: Math.ceil(deficit / bucket.ratePerMs),
    };
  }

  /**
   * Congestion in 0..1, where 1 is a fully drained bucket.
   *
   * The router uses this as a soft penalty *before* the hard limit bites, so
   * load spreads gradually instead of every task hammering one expert until it
   * hits the wall and then stampeding to the next.
   */
  congestion(expert: ExpertId): number {
    const bucket = this.bucketFor(expert);
    this.refill(bucket);
    if (bucket.capacity === 0) return 1;
    return Math.max(0, Math.min(1, 1 - bucket.tokens / bucket.capacity));
  }

  /** Return unspent tokens after a task fails before doing real work. */
  refund(expert: ExpertId, tokens: number): void {
    if (tokens <= 0) return;
    const bucket = this.bucketFor(expert);
    this.refill(bucket);
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokens);
  }

  snapshot(): Array<{ expert: ExpertId; tokens: number; capacity: number }> {
    return [...this.buckets.entries()].map(([expert, b]) => {
      this.refill(b);
      return { expert, tokens: b.tokens, capacity: b.capacity };
    });
  }
}
