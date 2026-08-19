// lib/trustshell/persistence/durable-ledger.ts
//
// The joint between `ReputationLedger` and `ReputationStore`.
//
// WHY THIS EXISTS AS CODE RATHER THAN TWO CALLS. Both ends have been built and
// tested for weeks and nothing joined them: the ledger has `snapshot()` and
// `hydrate()`, the store has `load()` and `save()`, and no file in `lib/` or
// `app/` ever put them in the same sentence. Written as two calls at a call
// site, the obvious ordering is also the dangerous one.
//
// ── THE INVARIANT ───────────────────────────────────────────────────────────
//
// **A ledger that did not load must never be saved.**
//
// `ReputationLedger` starts empty and scores an unknown id at `prior`. So a
// failed load leaves a ledger that is indistinguishable, by inspection, from a
// fleet with no history — and saving it writes that emptiness over every real
// row. `SupabaseReputationStore.load()` already refuses to report a null result
// as an empty ledger for exactly this reason, and says so in its own comment:
// *"an empty load followed by a save would erase every row."*
//
// That guard protects the load path only. Nothing protected the ORDER, and the
// order is where the data loss lives: load throws, a caller catches and carries
// on, the turn completes, the outcome is recorded, and the save wipes the table
// with a ledger holding one id. Every step succeeds. This module makes that
// sequence impossible to express — `persist` on a ledger that never hydrated
// throws rather than writing.
//
// ── THREE OUTCOMES, NOT TWO ─────────────────────────────────────────────────
//
// `hydrate` returns LOADED / EMPTY / NOT_CHECKED, and EMPTY is deliberately its
// own state rather than a zero-length LOADED. A store that genuinely holds no
// rows and a store that could not be read are different facts with the same
// shape, and collapsing them is the defect this repository is named for.
//
// EMPTY permits a later persist; NOT_CHECKED does not. That asymmetry is the
// whole point: an empty fleet is a measurement, an unreadable one is not.
//
// ── DEPENDENCY-FREE, AND OUTSIDE `harness/` ─────────────────────────────────
//
// It imports types only, so it binds to no database. It nonetheless lives in
// `persistence/` rather than `harness/`, because `check:harness-portable`
// enforces that `harness/` stays adoptable by other trust systems, and a joint
// that names persistence is a Trinity concern even when it holds no driver.

import type { ReputationLedger, ReputationRecord, ReputationStore } from '../harness/reputation';

/** What a hydrate attempt actually established. Never two states. */
export type HydrateOutcome = 'LOADED' | 'EMPTY' | 'NOT_CHECKED';

export interface HydrateResult {
  outcome: HydrateOutcome;
  /** How many records were applied. Zero for EMPTY and NOT_CHECKED alike. */
  applied: number;
  /** Why, in the operator's words. Always populated, including on success. */
  detail: string;
}

export type PersistOutcome = 'SAVED' | 'REFUSED' | 'NOT_CHECKED';

export interface PersistResult {
  outcome: PersistOutcome;
  /** How many records were offered to the store. */
  offered: number;
  detail: string;
}

/**
 * A ledger bound to a store, which knows whether it ever loaded.
 *
 * Deliberately NOT a subclass of `ReputationLedger`. Inheriting would let a
 * caller reach `record()` and `snapshot()` on an instance that never hydrated
 * and hand the snapshot to a store directly, which is the exact sequence this
 * type exists to prevent. Composition keeps the dangerous path off the object.
 */
export class DurableLedger {
  /**
   * `null` until hydrate has been attempted. Tri-state on purpose: "never
   * tried" and "tried and failed" are different, and only the second is a
   * caller's mistake.
   */
  private loaded: boolean | null = null;

  constructor(
    private readonly ledger: ReputationLedger,
    private readonly store: ReputationStore
  ) {}

  /** True once a load has succeeded. A caller may ask rather than infer. */
  get isHydrated(): boolean {
    return this.loaded === true;
  }

  /**
   * Load persisted state into the ledger.
   *
   * A store that throws yields NOT_CHECKED and leaves the ledger UNTOUCHED —
   * not partially applied. A partial hydrate is worse than none, because the
   * ids that did land look authoritative next to the ids that did not.
   */
  async hydrate(): Promise<HydrateResult> {
    let records: readonly ReputationRecord[];
    try {
      records = await this.store.load();
    } catch (err) {
      this.loaded = false;
      const why = err instanceof Error ? err.message : String(err);
      return {
        outcome: 'NOT_CHECKED',
        applied: 0,
        detail:
          `the reputation store could not be read (${why}). The ledger is untouched and ` +
          `persist() will refuse: saving now would write an empty ledger over live rows.`,
      };
    }

    // A store that answers with a non-array is broken, not empty.
    if (!Array.isArray(records)) {
      this.loaded = false;
      return {
        outcome: 'NOT_CHECKED',
        applied: 0,
        detail:
          'the reputation store returned a non-array. Treated as unreadable rather than ' +
          'empty, because an empty ledger followed by a save erases every row.',
      };
    }

    this.ledger.hydrate(records);
    this.loaded = true;

    if (records.length === 0) {
      return {
        outcome: 'EMPTY',
        applied: 0,
        detail:
          'the store holds no scored records. This is a MEASUREMENT, not a failure — an ' +
          'unscored fleet is a real state — so persist() is permitted.',
      };
    }
    return {
      outcome: 'LOADED',
      applied: records.length,
      detail: `${records.length} record(s) applied to the ledger.`,
    };
  }

  /**
   * Write the ledger back.
   *
   * REFUSES unless a hydrate succeeded. Throwing was considered and rejected:
   * this sits at the end of a turn whose work is already done, and an exception
   * there tends to be caught and logged by a caller that then continues — which
   * is how a refusal becomes a warning. A typed REFUSED that the caller must
   * read is harder to discard than an exception it can swallow.
   */
  async persist(): Promise<PersistResult> {
    if (this.loaded !== true) {
      const because =
        this.loaded === null
          ? 'hydrate() was never called'
          : 'hydrate() ran and could not read the store';
      return {
        outcome: 'REFUSED',
        offered: 0,
        detail:
          `refusing to save: ${because}. An unhydrated ledger scores every unknown id at the ` +
          `prior, so writing it would replace real history with defaults. Hydrate first, or ` +
          `accept that this turn's outcomes are not persisted.`,
      };
    }

    const records = this.ledger.snapshot();
    try {
      await this.store.save(records);
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      return {
        outcome: 'NOT_CHECKED',
        offered: records.length,
        detail:
          `the store rejected the write (${why}). The ledger is unchanged in memory; ` +
          `nothing about the durable copy is known from this attempt.`,
      };
    }
    return {
      outcome: 'SAVED',
      offered: records.length,
      detail: `${records.length} record(s) written.`,
    };
  }
}
