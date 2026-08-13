// lib/trustshell/harness/replay.ts — self-healing state replay.
//
// "If an agent provides corrupted or malformed data, log the error, reset the
// agent session state, and replay the previous message."
//
// The structure is taken from LangGraph's checkpointer plus
// `_internal/_replay.py`. Two ideas are worth importing precisely:
//
//   * REPLAY RESTORES THE CHECKPOINT FROM *BEFORE* THE FAILURE POINT, not the
//     latest one. The latest checkpoint may already contain the corruption
//     that caused the failure, so replaying from it reproduces the fault
//     forever.
//   * FIRST-VISIT SEMANTICS. LangGraph's ReplayState tracks which namespaces
//     have already restored a pre-replay checkpoint, so a loop's second
//     iteration uses normal loading. Without it, a node inside a loop rewinds
//     on every pass and the loop never advances.
//
// Added here because a trust harness needs it and LangGraph does not have the
// concept: a REPLAY BUDGET whose exhaustion is a NAMED TERMINAL STATE
// (`replay_exhausted`) rather than an exception. That shape is from crewAI's
// Flow examples, where the retry loop routes to an explicit
// `max_retry_exceeded` branch. An exception gets caught somewhere generic and
// attributed to the wrong component; a named state stays traceable.

import type { Clock } from '@/lib/trustshell/harness/types';

/**
 * Deep-clone checkpoint state.
 *
 * Uses the runtime's `structuredClone` when present and falls back to a JSON
 * round-trip. Not typed against `structuredClone` directly: that global lives
 * in the DOM lib, and this directory must compile without it — the portability
 * constraint in types.ts is the point of the harness, so leaning on a
 * browser-typed global to satisfy the compiler would quietly break it.
 *
 * Checkpoint state must therefore be serializable. That is a real constraint,
 * stated rather than discovered: these checkpoints are meant to persist to
 * Postgres, so anything that cannot survive serialization could not have been
 * checkpointed anyway.
 */
function cloneState<S>(state: S): S {
  const maybe = (globalThis as { structuredClone?: (v: unknown) => unknown }).structuredClone;
  if (typeof maybe === 'function') return maybe(state) as S;
  return JSON.parse(JSON.stringify(state)) as S;
}

export interface Checkpoint<S> {
  id: string;
  namespace: string;
  state: S;
  createdAt: number;
  /** Sequence within a namespace. Monotonic, assigned on write. */
  seq: number;
}

export interface CheckpointStore<S> {
  put(namespace: string, state: S): Checkpoint<S>;
  latest(namespace: string): Checkpoint<S> | null;
  /** Newest checkpoint strictly before `seq`. */
  before(namespace: string, seq: number): Checkpoint<S> | null;
  list(namespace: string): Checkpoint<S>[];
}

/** In-memory store. Swap for Postgres in deployment; the interface is the seam. */
export class MemoryCheckpointStore<S> implements CheckpointStore<S> {
  private readonly byNamespace = new Map<string, Checkpoint<S>[]>();
  private seq = 0;

  constructor(private readonly clock: Clock) {}

  put(namespace: string, state: S): Checkpoint<S> {
    this.seq += 1;
    const cp: Checkpoint<S> = {
      id: `cp-${this.seq}`,
      namespace,
      // Structured-clone the state so a later mutation of the caller's object
      // cannot retroactively rewrite history. A checkpoint that changes after
      // it is written is worse than no checkpoint.
      state: cloneState(state),
      createdAt: this.clock.now(),
      seq: this.seq,
    };
    const list = this.byNamespace.get(namespace) ?? [];
    list.push(cp);
    this.byNamespace.set(namespace, list);
    return cp;
  }

  latest(namespace: string): Checkpoint<S> | null {
    const list = this.byNamespace.get(namespace);
    return list && list.length > 0 ? list[list.length - 1] : null;
  }

  before(namespace: string, seq: number): Checkpoint<S> | null {
    const list = this.byNamespace.get(namespace) ?? [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].seq < seq) return list[i];
    }
    return null;
  }

  list(namespace: string): Checkpoint<S>[] {
    return [...(this.byNamespace.get(namespace) ?? [])];
  }
}

export type ReplayOutcome<S> =
  | { status: 'ok'; state: S; attempts: number }
  | { status: 'recovered'; state: S; attempts: number; restoredFrom: string }
  | { status: 'replay_exhausted'; attempts: number; lastError: string; namespace: string }
  | { status: 'no_checkpoint'; attempts: number; lastError: string; namespace: string };

export interface ReplayConfig {
  /** Replays after the initial attempt. 0 disables replay entirely. */
  maxReplays: number;
}

export interface StepFailure {
  namespace: string;
  attempt: number;
  error: string;
  restoredFromCheckpoint: string | null;
  at: number;
}

/**
 * Runs a step, and on corruption rewinds to the pre-failure checkpoint.
 *
 * `validate` is what distinguishes this from a plain retry: a step that
 * *returns* corrupt data has not thrown, and retrying it without noticing is
 * how malformed output reaches the final answer. Returning a string from
 * `validate` marks the output corrupt and states why.
 */
export class ReplayController<S> {
  private readonly visited = new Set<string>();
  readonly failures: StepFailure[] = [];

  constructor(
    private readonly clock: Clock,
    private readonly store: CheckpointStore<S>,
    private readonly cfg: ReplayConfig
  ) {
    if (cfg.maxReplays < 0) throw new Error('maxReplays must be >= 0');
  }

  /**
   * First visit to a namespace within one replay session.
   *
   * LangGraph's rule: only the first visit restores the pre-replay checkpoint;
   * later visits (a loop's second pass) load normally, so the loop can advance.
   */
  isFirstVisit(namespace: string): boolean {
    if (this.visited.has(namespace)) return false;
    this.visited.add(namespace);
    return true;
  }

  /** Clear first-visit tracking, e.g. when starting a new parent run. */
  resetVisits(): void {
    this.visited.clear();
  }

  async run(
    namespace: string,
    initial: S,
    step: (state: S) => Promise<S>,
    validate: (state: S) => string | null
  ): Promise<ReplayOutcome<S>> {
    const anchor = this.store.put(namespace, initial);
    let attempts = 0;
    let lastError = '';

    for (let replay = 0; replay <= this.cfg.maxReplays; replay += 1) {
      attempts += 1;

      // On the first attempt use the caller's state. On a replay, rewind to
      // the checkpoint *before* the anchor when one exists — the anchor itself
      // may already hold the corruption.
      let inputState: S;
      let restoredFrom: string | null = null;

      if (replay === 0) {
        inputState = initial;
      } else {
        const prior = this.store.before(namespace, anchor.seq);
        if (prior) {
          inputState = cloneState(prior.state);
          restoredFrom = prior.id;
        } else {
          // Nothing earlier to rewind to. Replaying the same input would just
          // reproduce the fault, so say so rather than burning the budget.
          return { status: 'no_checkpoint', attempts, lastError, namespace };
        }
      }

      try {
        const output = await step(inputState);
        const corruption = validate(output);
        if (corruption === null) {
          this.store.put(namespace, output);
          return restoredFrom
            ? { status: 'recovered', state: output, attempts, restoredFrom }
            : { status: 'ok', state: output, attempts };
        }
        lastError = `Validation failed: ${corruption}`;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }

      this.failures.push({
        namespace,
        attempt: attempts,
        error: lastError,
        restoredFromCheckpoint: restoredFrom,
        at: this.clock.now(),
      });
    }

    return { status: 'replay_exhausted', attempts, lastError, namespace };
  }
}
