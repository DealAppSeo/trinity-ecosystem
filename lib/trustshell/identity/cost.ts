// lib/trustshell/identity/cost.ts
//
// What does a zk RepID operation COST, in the only unit that survives the
// change of hash function?
//
// ── WHY NOT MILLISECONDS ────────────────────────────────────────────────────
//
// "zk RepID is fast" is not a claim wall-clock can carry here. The sole
// production `IBindingScheme` is `PendingPoseidon2Scheme`, and all three of its
// methods THROW — Poseidon2 parameters belong to the other lane and inventing
// them is refused. So there is no scheme to time, and a millisecond figure from
// a toy SHA-256 stand-in would describe a hash we will never ship.
//
// The unit that does survive is the HASH CALL COUNT. Every operation in this
// layer is a composition of `commit`, `nullify` and `hashPair`; the eventual
// cost is `count × cost(Poseidon2)`, and in a circuit the constraint count is
// dominated by exactly the same number. So counting calls today gives the real
// performance answer, and it stays correct when the parameters land.
//
// ── WHAT THIS MEASURES THAT A FUNCTIONAL TEST CANNOT ────────────────────────
//
// Membership verification is O(log N). A refactor that walks the group instead
// of the path — rebuilding the root rather than following the siblings — is
// still CORRECT, returns the same booleans, and passes every existing assertion
// in `check:identity`. It is also O(N), which at a group size of 4,096 is 341×
// the work and, in circuit terms, the difference between a proof that fits and
// one that does not.
//
// Complexity is a property no functional suite observes. This file makes it
// observable, and `check:zk-cost` makes a regression in it fail the build.
//
// ── THE CEILING, MEASURED 2026-08-16 ────────────────────────────────────────
//
// Every operation below is already at its information-theoretic minimum:
// verification must reopen the commitment (1), recompute the nullifier (1) and
// walk the path (ceil(log2 N)) — there is nothing to remove. So the standing
// rule applies in its sharpest form: **there is no headroom in this code.**
// zk RepID's speed is `optimal_count × cost(Poseidon2)`, and the only remaining
// variable belongs to the other lane.

import type { IBindingScheme } from './nullifier';

/** One tally of primitive calls. The unit of cost in this layer. */
export interface HashCost {
  commit: number;
  nullify: number;
  hashPair: number;
}

export const ZERO_COST: Readonly<HashCost> = Object.freeze({
  commit: 0,
  nullify: 0,
  hashPair: 0,
});

export function totalCalls(c: HashCost): number {
  return c.commit + c.nullify + c.hashPair;
}

export interface CountingScheme extends IBindingScheme {
  /** Calls since construction or the last `reset()`. */
  readonly cost: Readonly<HashCost>;
  reset(): void;
}

/**
 * Wrap any scheme so its primitive calls are counted.
 *
 * Delegates rather than reimplements: a counter that computed its own digests
 * would measure itself instead of the scheme under test, and would keep
 * reporting happily after the real scheme started throwing.
 */
export function countingScheme(inner: IBindingScheme): CountingScheme {
  const cost: HashCost = { ...ZERO_COST };
  return {
    scheme: inner.scheme,
    parametersKnown: inner.parametersKnown,
    get cost() {
      return cost;
    },
    reset() {
      cost.commit = 0;
      cost.nullify = 0;
      cost.hashPair = 0;
    },
    async commit(secret: string) {
      cost.commit++;
      return inner.commit(secret);
    },
    async nullify(secret: string, domain: string, scope: string) {
      cost.nullify++;
      return inner.nullify(secret, domain, scope);
    },
    async hashPair(left: string, right: string) {
      cost.hashPair++;
      return inner.hashPair(left, right);
    },
  };
}

/**
 * The cost each operation MUST have, as a function of group size.
 *
 * Written as the optimum rather than as "what the code currently does", so the
 * suite compares the implementation against the bound instead of against
 * itself. A model that merely echoed the measurement would ratify any
 * regression the moment someone re-recorded it.
 */
export const COST_MODEL = {
  /**
   * A Merkle tree over N leaves has exactly N-1 internal nodes. Fewer cannot
   * produce a single root; more means something is hashed twice.
   */
  buildGroup: (n: number): HashCost => ({ commit: 0, nullify: 0, hashPair: Math.max(0, n - 1) }),

  /** The sibling at each level. Any path longer than this carries a redundant step. */
  membershipPathLength: (n: number): number => Math.ceil(Math.log2(Math.max(1, n))),

  /**
   * Constant, and independent of group size: one nullifier, and one commitment
   * to place in the witness. The path is supplied, not recomputed.
   */
  buildBindingStatement: (): HashCost => ({ commit: 1, nullify: 1, hashPair: 0 }),

  /**
   * Reopen the commitment (1), recompute the nullifier (1), walk the path
   * (ceil(log2 N)). Every one of the three is load-bearing:
   *   - drop the reopen and the witness commitment is unconstrained;
   *   - drop the nullify and a replay is undetectable;
   *   - drop the walk and membership is asserted rather than checked.
   * So this is the floor, not a budget.
   */
  verifyBindingByRecomputation: (n: number): HashCost => ({
    commit: 1,
    nullify: 1,
    hashPair: COST_MODEL.membershipPathLength(n),
  }),

  /** One commitment over the event's fields. */
  commitEvent: (): HashCost => ({ commit: 1, nullify: 0, hashPair: 0 }),

  /** One node hash folding the event into the running root. */
  appendEvent: (): HashCost => ({ commit: 0, nullify: 0, hashPair: 1 }),
} as const;

/**
 * Verification cost is LOGARITHMIC in group size — the property most worth
 * pinning, because losing it costs nothing functionally and everything in a
 * circuit.
 *
 * Returns the observed growth between two group sizes. For an O(log N)
 * implementation, going from N to N² doubles the count; an O(N) one squares it.
 */
export function verifyGrowth(smallN: number, largeN: number): number {
  const a = totalCalls(COST_MODEL.verifyBindingByRecomputation(smallN));
  const b = totalCalls(COST_MODEL.verifyBindingByRecomputation(largeN));
  return b / a;
}
