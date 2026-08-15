// lib/trustshell/harness/types.ts — core types for the portable trust harness.
//
// PORTABILITY IS A HARD CONSTRAINT. Nothing in lib/trustshell/harness/ may
// import Supabase, Next, or anything else in this repo. Every external
// dependency arrives through an injected interface: the clock, the trust
// source, the storage. That is what lets this ship as a package other trust
// systems can adopt — the point of RepID being a *portable* reputation layer
// rather than a Trinity feature.
//
// The rule is enforced, not aspirational: scripts/harness-portability-check.mjs
// fails on any import outside this directory.

/** Stable identifier for an expert (an agent node, a model, a service). */
export type ExpertId = string;

/**
 * A trust score in basis points, 0..10000.
 *
 * Integer basis points rather than a 0..1 float because these values are
 * compared for consensus and written to receipts. Float equality across
 * languages and serialization boundaries is a bug generator, and this layer is
 * meant to be reimplemented in other stacks.
 */
export type Bps = number;

export const BPS_MAX = 10_000;

/**
 * What an expert claims it can do, and what the ledger says it has done.
 *
 * The two halves are deliberately separate and they come from different
 * places. `capabilities` and `embedding` are self-declared — cheap, unverified,
 * useful only for matching. `earnedScore` comes from the reputation ledger and
 * is the only field allowed to influence ranking weight.
 *
 * This split is the whole thesis. kyegomez/swarms' AuctionSwarm ranks experts
 * by a self-reported `confidence` returned from a forced tool call, and never
 * reconciles it against outcomes — an expert that claims 0.95 and fails every
 * time keeps winning forever. Self-report is exactly what a reputation layer
 * exists to replace, so here it cannot reach the ranking.
 */
export interface ExpertProfile {
  id: ExpertId;
  /** Self-declared capability tags. Matching only — never weighting. */
  capabilities: string[];
  /** Self-declared embedding for similarity routing. Matching only. */
  embedding?: number[];
  /** LEDGER-DERIVED. Earned reputation, 0..10000. The only ranking input. */
  earnedScore: Bps;
  /**
   * LEDGER-DERIVED. Perceived reputation — claimed, endorsed, or otherwise
   * unearned. Carried so callers can *observe* the gap, never to rank by.
   */
  perceivedScore?: Bps;
  /** Cost hint in arbitrary units. Used for tie-breaking, not for trust. */
  costHint?: number;
  /** True when the ledger has too few observations to be meaningful. */
  coldStart: boolean;
  /**
   * LEDGER-DERIVED. How many outcomes back `earnedScore`. Optional.
   *
   * ADDED 2026-08-14 because the router could not tell two different states
   * apart and was forced to guess. `coldStart` is true both for an expert with
   * NO evidence and for one with SOME — 19 failures in a row is still cold —
   * and those want opposite treatment: the first must be scored at the midpoint
   * (no evidence is not evidence of badness), the second must be allowed to
   * rank on the evidence it has, in whichever direction it points.
   *
   * Omit it and the router stays conservative, never scoring a cold expert
   * below the midpoint. Supplying it is worth roughly 0.9pp of delivered
   * quality — see `scripts/harness-newcomer.mjs`.
   */
  observations?: number;
}

/** A unit of work to route. */
export interface Task {
  id: string;
  /** Capability tags required. An expert must hold all of them. */
  requires: string[];
  /** Optional embedding for similarity ranking against expert embeddings. */
  embedding?: number[];
  /** Higher runs first within the same readiness class. */
  priority?: number;
  /** Estimated tokens, charged against the expert's bucket on admission. */
  estimatedTokens?: number;
}

/** Why an expert was not selected. Kept for attribution, see below. */
export type RejectionReason =
  | 'missing_capability'
  | 'rate_limited'
  | 'at_capacity'
  | 'circuit_open'
  | 'below_trust_floor'
  | 'excluded_by_caller';

export interface Rejection {
  expert: ExpertId;
  reason: RejectionReason;
  detail: string;
}

/**
 * A routing decision, with every input that produced it.
 *
 * "Opaque failure attribution" is one of the named MoE failure modes: when a
 * swarm answers wrongly, tracing which routing decision caused it is
 * notoriously hard. The fix is not better logging after the fact — it is
 * making the decision record carry its own inputs. `rejected` is as important
 * as `selected`, because the common bad outcome is a capable expert silently
 * never being considered.
 */
export interface RoutingDecision {
  taskId: string;
  selected: ExpertId | null;
  /** Ranked alternates, best first, excluding the selected expert. */
  alternates: ExpertId[];
  rejected: Rejection[];
  /** Per-expert score breakdown for the candidates that were ranked. */
  scores: Array<{
    expert: ExpertId;
    similarity: number;
    trustWeight: number;
    congestionPenalty: number;
    final: number;
    exploration: boolean;
  }>;
  decidedAt: number;
  /** Set when no expert could take the task; names the dominant reason. */
  unroutableReason?: RejectionReason | 'no_candidates';
}

/** Injectable clock. Real time is a dependency like any other. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** A fixed clock for tests and simulations. */
export class ManualClock implements Clock {
  constructor(private t: number = 0) {}
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
  set(t: number): void {
    this.t = t;
  }
}

/**
 * Cosine similarity, with the degenerate cases pinned.
 *
 * Returns 0 for absent, empty, mismatched-length, or zero-magnitude vectors
 * rather than NaN. A NaN here propagates silently into a ranking and produces
 * an arbitrary winner — the routing equivalent of a green build over undefined
 * references.
 */
export function cosineSimilarity(a?: number[], b?: number[]): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  const raw = dot / denom;
  // Guard against floating drift pushing this outside [-1, 1].
  return Math.max(-1, Math.min(1, raw));
}
