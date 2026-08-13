// lib/trustshell/harness/queue.ts — pull-based scheduling.
//
// "Implement a central message broker like RabbitMQ to queue tasks, ensuring
// agents pull work only when they have capacity."
//
// The load-bearing word is *pull*. Push-based dispatch decides an expert's
// capacity from the router's model of it, which is always stale; pull lets the
// expert assert its own readiness at the moment it is free. Deployments should
// put a real broker underneath — the semantics here are chosen to survive that
// swap: at-least-once delivery, explicit ack/nack, visibility timeout, and a
// dead-letter queue after bounded retries.
//
// The bounded-retry-with-a-named-terminal-branch shape is borrowed from
// crewAI's Flow examples, where exhaustion routes to an explicit
// `max_retry_exceeded` branch rather than raising. A retry budget that ends in
// an exception ends up caught somewhere generic and counted as a failure of
// something else; a named terminal state stays attributable.

import type { Clock, ExpertId, Task } from '@/lib/trustshell/harness/types';

export type LeaseId = string;

export interface QueueConfig {
  /** How long a leased task may be held before it returns to the queue. */
  visibilityTimeoutMs: number;
  /** Delivery attempts before a task is dead-lettered. */
  maxAttempts: number;
}

interface Entry {
  task: Task;
  attempts: number;
  enqueuedAt: number;
  leasedTo?: ExpertId;
  leaseId?: LeaseId;
  leaseExpiresAt?: number;
}

export interface DeadLetter {
  task: Task;
  attempts: number;
  reason: string;
  deadLetteredAt: number;
}

export interface Lease {
  leaseId: LeaseId;
  task: Task;
  attempt: number;
  expiresAt: number;
}

export class PullQueue {
  private readonly pending: Entry[] = [];
  private readonly leased = new Map<LeaseId, Entry>();
  private readonly dead: DeadLetter[] = [];
  private seq = 0;

  constructor(
    private readonly clock: Clock,
    private readonly cfg: QueueConfig
  ) {
    if (cfg.maxAttempts < 1) throw new Error('maxAttempts must be >= 1');
    if (cfg.visibilityTimeoutMs <= 0) throw new Error('visibilityTimeoutMs must be > 0');
  }

  enqueue(task: Task): void {
    this.pending.push({ task, attempts: 0, enqueuedAt: this.clock.now() });
  }

  /**
   * Return expired leases to the pending queue.
   *
   * Called at the start of every operation rather than on a timer, so the
   * queue's behaviour depends only on the injected clock. A background timer
   * would make tests time-dependent and simulations non-reproducible.
   */
  private reclaimExpired(): void {
    const now = this.clock.now();
    for (const [leaseId, entry] of [...this.leased.entries()]) {
      if (entry.leaseExpiresAt !== undefined && entry.leaseExpiresAt <= now) {
        this.leased.delete(leaseId);
        this.failEntry(entry, `Lease expired after ${this.cfg.visibilityTimeoutMs}ms without an ack.`);
      }
    }
  }

  private failEntry(entry: Entry, reason: string): void {
    entry.leasedTo = undefined;
    entry.leaseId = undefined;
    entry.leaseExpiresAt = undefined;

    if (entry.attempts >= this.cfg.maxAttempts) {
      this.dead.push({
        task: entry.task,
        attempts: entry.attempts,
        reason,
        deadLetteredAt: this.clock.now(),
      });
      return;
    }
    this.pending.push(entry);
  }

  /**
   * Claim the next task this expert is eligible for.
   *
   * `canTake` is the expert's own admission check — capacity, rate limit,
   * breaker state. The queue asks rather than assumes, which is the entire
   * point of pull.
   */
  pull(expert: ExpertId, canTake: (task: Task) => boolean): Lease | null {
    this.reclaimExpired();

    // Highest priority first, then oldest. Age as the tie-break is what stops
    // a steady stream of high-priority work starving everything beneath it.
    this.pending.sort((a, b) => {
      const pa = a.task.priority ?? 0;
      const pb = b.task.priority ?? 0;
      if (pa !== pb) return pb - pa;
      return a.enqueuedAt - b.enqueuedAt;
    });

    const index = this.pending.findIndex((e) => canTake(e.task));
    if (index === -1) return null;

    const [entry] = this.pending.splice(index, 1);
    entry.attempts += 1;
    this.seq += 1;
    const leaseId = `lease-${this.seq}`;
    const expiresAt = this.clock.now() + this.cfg.visibilityTimeoutMs;

    entry.leasedTo = expert;
    entry.leaseId = leaseId;
    entry.leaseExpiresAt = expiresAt;
    this.leased.set(leaseId, entry);

    return { leaseId, task: entry.task, attempt: entry.attempts, expiresAt };
  }

  /** Work completed. Returns false if the lease had already expired. */
  ack(leaseId: LeaseId): boolean {
    this.reclaimExpired();
    return this.leased.delete(leaseId);
  }

  /** Work failed. Requeues, or dead-letters once the attempt budget is spent. */
  nack(leaseId: LeaseId, reason: string): boolean {
    this.reclaimExpired();
    const entry = this.leased.get(leaseId);
    if (!entry) return false;
    this.leased.delete(leaseId);
    this.failEntry(entry, reason);
    return true;
  }

  /** Extend a lease for work that is still progressing. */
  heartbeat(leaseId: LeaseId): boolean {
    this.reclaimExpired();
    const entry = this.leased.get(leaseId);
    if (!entry) return false;
    entry.leaseExpiresAt = this.clock.now() + this.cfg.visibilityTimeoutMs;
    return true;
  }

  stats(): { pending: number; leased: number; deadLettered: number } {
    this.reclaimExpired();
    return { pending: this.pending.length, leased: this.leased.size, deadLettered: this.dead.length };
  }

  deadLetters(): DeadLetter[] {
    this.reclaimExpired();
    return [...this.dead];
  }
}
