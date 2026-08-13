// lib/trustshell/MemoryRecall.ts
//
// The recall path: how a Trinity agent gets memory *back out*.
//
// Why this file exists, stated as a measurement rather than an intention.
// On 2026-08-13 the live database held 429 rows in `agent_memory_nodes`, 305 in
// `agent_memory_edges` and 215 in `trinity_learned_patterns`. The number of
// those rows that had ever been read back was zero — `access_count > 0` matched
// nothing, and `trinity_skills.last_used_at` was null on all 14 rows. Trinity
// does not have a memory problem. It has a *recall* problem: it writes memory
// faithfully and has never once retrieved it.
//
// So this module is deliberately not another store. It is the read side, and
// the parts of the read side that are easy to get quietly wrong:
//
//   - fusing two rankings without letting one silently dominate  (rrfFuse)
//   - degrading when an index is missing, and SAYING so          (chooseRecallTier)
//   - fitting results in a context window without silent loss    (applyRecallBudget)
//   - scoring which memory deserves to come back                 (utilityScore)
//
// Design borrowed, with attribution, from TencentCloud/TencentDB-Agent-Memory
// (MIT): reciprocal rank fusion at k=60, the three-tier recall degradation, and
// the item/char/timeout budget triple. Two things are deliberately NOT borrowed
// and are documented at their call sites: their write-side gate is permissive
// when unconfigured, and their reuse counter is a popularity count. Both are
// wrong for a harness where capability is supposed to be earned.
//
// This module is pure. No client, no clock, no env — every time-dependent
// function takes `now` as an argument, so results are reproducible and a
// receipt over them can be re-derived. See lib/CLAUDE.md on module scope.

// ---------------------------------------------------------------------------
// Recall tiers
// ---------------------------------------------------------------------------

/**
 * How a recall was actually served.
 *
 * `none` is a first-class outcome, not an error. An agent that retrieved
 * nothing because no index exists must be able to tell that apart from an
 * agent that retrieved nothing because nothing matched — the first is a broken
 * deployment, the second is a fact about the corpus. Collapsing them is the
 * two-outcome failure this codebase keeps rediscovering (CLAUDE.md, "three
 * outcomes, never two").
 */
export type RecallTier = 'hybrid' | 'vector' | 'keyword' | 'none';

export interface IndexCapabilities {
  /** A vector index exists AND at least one row carries a non-null embedding. */
  vectorReady: boolean;
  /** A lexical index (FTS/BM25/trigram) is queryable. */
  keywordReady: boolean;
  /** An embedding service is reachable to vectorise the *query*. */
  embedderReady: boolean;
}

export interface TierChoice {
  tier: RecallTier;
  /** Why this tier and not a better one. Always populated, including on hybrid. */
  reason: string;
  /**
   * True when the tier is worse than `hybrid` because something is missing.
   * Callers should surface this; a degraded recall that reports itself as a
   * normal one is how "we searched and found nothing" becomes a false negative.
   */
  degraded: boolean;
}

/**
 * Pick the best recall strategy the available indexes can actually serve.
 *
 * The ordering is hybrid > vector > keyword > none. Note that vector recall
 * needs *two* things — a populated index and a live embedder to turn the query
 * into a vector. Having 213 embedded rows and no embedder is not a vector
 * capability, and treating it as one produces an empty result set that looks
 * like an honest miss.
 */
export function chooseRecallTier(caps: IndexCapabilities): TierChoice {
  const vector = caps.vectorReady && caps.embedderReady;

  if (vector && caps.keywordReady) {
    return { tier: 'hybrid', reason: 'vector and keyword indexes both available', degraded: false };
  }
  if (vector) {
    return {
      tier: 'vector',
      reason: 'keyword index unavailable; vector only',
      degraded: true,
    };
  }
  if (caps.keywordReady) {
    const why = !caps.vectorReady
      ? 'no populated vector index'
      : 'embedder unreachable, cannot vectorise query';
    return { tier: 'keyword', reason: `${why}; keyword only`, degraded: true };
  }
  return {
    tier: 'none',
    reason: 'no keyword index and no usable vector index — recall cannot run',
    degraded: true,
  };
}

// ---------------------------------------------------------------------------
// Reciprocal rank fusion
// ---------------------------------------------------------------------------

/**
 * Standard RRF constant from Cormack et al. Higher k flattens the curve, giving
 * lower-ranked items more weight relative to the top hit.
 */
export const RRF_K = 60;

export interface FusedItem<T> {
  item: T;
  rrfScore: number;
  /** How many input lists contained this item. Used to reward cross-agreement. */
  listHits: number;
}

/**
 * Merge ranked lists by reciprocal rank fusion.
 *
 * Each list contributes 1/(k + rank + 1) per item; items in several lists sum.
 * RRF is used here rather than score normalisation because BM25 scores and
 * cosine similarities are not on a shared scale, and any attempt to rescale
 * them into one bakes in a weighting nobody can justify from evidence.
 *
 * Ties break deterministically on id so that two runs over identical inputs
 * produce identical output — required if a receipt is ever taken over a recall.
 */
export function rrfFuse<T>(
  lists: readonly (readonly T[])[],
  getId: (item: T) => string,
  k: number = RRF_K,
): FusedItem<T>[] {
  const merged = new Map<string, FusedItem<T>>();

  for (const list of lists) {
    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank];
      const id = getId(item);
      const contribution = 1 / (k + rank + 1);
      const existing = merged.get(id);
      if (existing) {
        existing.rrfScore += contribution;
        existing.listHits += 1;
      } else {
        merged.set(id, { item, rrfScore: contribution, listHits: 1 });
      }
    }
  }

  // `merged.forEach` rather than spreading `merged.entries()`: the project's
  // tsconfig target rejects iterating a Map iterator without downlevelIteration,
  // and this module must compile under the repo's settings, not just the test
  // harness's explicit --target es2019.
  const out: FusedItem<T>[] = [];
  merged.forEach((v) => out.push(v));

  return out.sort(
    (a, b) => b.rrfScore - a.rrfScore || getId(a.item).localeCompare(getId(b.item)),
  );
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

export interface RecallBudget {
  /** Hard cap on items returned. */
  maxItems: number;
  /** Hard cap on total characters across all returned items. */
  maxChars: number;
}

export interface BudgetedRecall<T> {
  kept: T[];
  /** Items dropped for exceeding maxItems. */
  droppedForCount: number;
  /** Items dropped for exceeding maxChars. */
  droppedForChars: number;
  /** Characters in `kept`. Never exceeds maxChars. */
  charsUsed: number;
  /**
   * Human-readable note when anything was dropped, else undefined.
   *
   * This exists because the failure mode of a context budget is not truncation
   * — it is *undisclosed* truncation. An agent told "here are your memories"
   * after 40 of 45 were silently cut will reason as though it saw everything.
   */
  truncationNote?: string;
}

/**
 * Apply the item and character caps, in that order, reporting every drop.
 *
 * Items are taken in the order given, so callers must sort by relevance first.
 * An item that alone exceeds `maxChars` is dropped rather than cut in half:
 * half a memory is a memory with its qualifier removed, which is worse than no
 * memory at all ("do not refactor the old auth module" truncated at the comma
 * inverts its meaning).
 */
export function applyRecallBudget<T>(
  items: readonly T[],
  budget: RecallBudget,
  getText: (item: T) => string,
): BudgetedRecall<T> {
  const byCount = items.slice(0, Math.max(0, budget.maxItems));
  const droppedForCount = items.length - byCount.length;

  const kept: T[] = [];
  let charsUsed = 0;
  let droppedForChars = 0;

  for (const item of byCount) {
    const len = getText(item).length;
    if (charsUsed + len > budget.maxChars) {
      droppedForChars += 1;
      continue;
    }
    kept.push(item);
    charsUsed += len;
  }

  const totalDropped = droppedForCount + droppedForChars;
  const truncationNote =
    totalDropped > 0
      ? `${kept.length} of ${items.length} memories shown ` +
        `(${droppedForCount} over item cap ${budget.maxItems}, ` +
        `${droppedForChars} over char budget ${budget.maxChars}). ` +
        `Search again with narrower terms if the answer is not here.`
      : undefined;

  return { kept, droppedForCount, droppedForChars, charsUsed, truncationNote };
}

// ---------------------------------------------------------------------------
// Utility scoring
// ---------------------------------------------------------------------------

export interface MemoryUtilityInput {
  /** Author-assigned or extractor-assigned importance, 0..1. */
  importance: number;
  /** Times this memory was recalled AND the surrounding task then succeeded. */
  reusedWithGoodOutcome: number;
  /** Times this memory was recalled AND the surrounding task then failed. */
  reusedWithBadOutcome: number;
  /** ISO timestamp of last access, or null if never read. */
  lastAccessedAt: string | null;
  /** ISO timestamp of creation. */
  createdAt: string;
}

export interface UtilityScore {
  score: number;
  /** Components, exposed so a low score can be explained rather than guessed at. */
  parts: { importance: number; outcome: number; recency: number };
}

/** Half-life in days for the recency term. */
export const RECENCY_HALF_LIFE_DAYS = 30;

/**
 * Score a memory's claim on scarce context budget.
 *
 * The one deliberate departure from the upstream design. TencentDB ranks assets
 * partly by `usage_count` — a popularity counter that goes up whenever an asset
 * is retrieved. For a system where retrieval privileges are supposed to be
 * *earned*, popularity is exactly the wrong signal: a memory that is recalled
 * constantly and is wrong every time outranks one recalled twice and correct
 * both times. Worse, it is trivially self-reinforcing — being retrieved makes a
 * memory more retrievable, with no reference to whether it helped.
 *
 * So the outcome term is a net: recalls followed by success minus recalls
 * followed by failure, squashed. A memory can score negative on outcome and
 * fall below memories nobody has used yet. That is intended — an actively
 * misleading memory should be harder to retrieve than an unproven one.
 *
 * `now` is a parameter, not `Date.now()`, so the same inputs always score the
 * same and a receipt over a ranking can be re-derived later.
 */
export function utilityScore(m: MemoryUtilityInput, now: string): UtilityScore {
  const importance = clamp01(m.importance);

  const net = m.reusedWithGoodOutcome - m.reusedWithBadOutcome;
  // tanh-like squash without Math.tanh's sensitivity around 0; maps to (-1, 1).
  const outcome = net / (1 + Math.abs(net));

  const referenceIso = m.lastAccessedAt ?? m.createdAt;
  const ageDays = daysBetween(referenceIso, now);
  const recency = ageDays === null ? 0 : Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);

  // Weights: importance is what the extractor thought, outcome is what actually
  // happened, recency is a tiebreak. Outcome is weighted highest on purpose —
  // it is the only term backed by an observed consequence.
  const score = 0.3 * importance + 0.5 * outcome + 0.2 * recency;

  return { score, parts: { importance, outcome, recency } };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function daysBetween(fromIso: string, toIso: string): number | null {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, (b - a) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Write-side: dedup decisions
// ---------------------------------------------------------------------------

/**
 * What to do with a newly extracted memory given what is already stored.
 * Vocabulary matches upstream so the two remain comparable.
 */
export type DedupAction = 'store' | 'update' | 'merge' | 'skip';

export interface DedupDecision {
  recordId: string;
  action: DedupAction;
  /** Existing rows this decision acts on. Empty for `store`. */
  targetIds: string[];
  reason: string;
}

/**
 * Whether conflict detection can run at all, given the indexes available.
 *
 * Upstream skips dedup entirely when neither vector nor keyword recall exists,
 * rather than paying for an O(N) scan. We keep that, but return the reason so
 * "dedup did not run" never reads as "there were no duplicates" — the live
 * corpus already carries 429 nodes at 305 distinct contents and 429 learning
 * events at 330 distinct lessons, which is what undetected duplication looks
 * like after three months.
 */
export function canDedup(caps: IndexCapabilities): { possible: boolean; reason: string } {
  if (caps.vectorReady && caps.embedderReady) {
    return { possible: true, reason: 'vector candidate recall available' };
  }
  if (caps.keywordReady) {
    return { possible: true, reason: 'keyword candidate recall available (degraded)' };
  }
  return {
    possible: false,
    reason: 'no candidate recall available — every write stored unchecked, duplicates expected',
  };
}

// ---------------------------------------------------------------------------
// Compiling a plan from a resolved harness profile
// ---------------------------------------------------------------------------

/** The subset of a resolved harness profile this module needs. */
export interface RecallSettings {
  scope: MemoryScope;
  maxItems: number;
  maxChars: number;
  timeoutMs: number;
  maxSearchesPerTurn: number;
}

/**
 * Whose memories an agent may read.
 *
 * `own` is the floor and is deliberately *not* zero. Reading back what this
 * agent itself recorded is baseline function, not a privilege — an agent denied
 * it is merely amnesiac, which protects nobody. Reading peers' memories is the
 * actual privilege, because that is where one agent's bad conclusion becomes
 * twelve agents' bad conclusion. That cut mirrors upstream's
 * private/team/restricted visibility model.
 */
export type MemoryScope = 'own' | 'team' | 'org';

export const SCOPE_ORDER: readonly MemoryScope[] = ['own', 'team', 'org'];

/** True when `candidate` grants strictly more reach than `current`. */
export function scopeWidens(current: MemoryScope, candidate: MemoryScope): boolean {
  return SCOPE_ORDER.indexOf(candidate) > SCOPE_ORDER.indexOf(current);
}

export interface RecallPlan {
  tier: RecallTier;
  degraded: boolean;
  tierReason: string;
  scope: MemoryScope;
  budget: RecallBudget;
  timeoutMs: number;
  maxSearchesPerTurn: number;
  /** True when the plan cannot return anything; caller should not pretend it ran. */
  inert: boolean;
}

/**
 * Turn resolved harness settings plus observed index capabilities into the
 * concrete plan a recall executor should follow.
 *
 * Keeping this separate from execution means the plan can be asserted in tests
 * and printed in a receipt without a database anywhere near it.
 */
export function compileRecallPlan(
  settings: RecallSettings,
  caps: IndexCapabilities,
): RecallPlan {
  const choice = chooseRecallTier(caps);
  return {
    tier: choice.tier,
    degraded: choice.degraded,
    tierReason: choice.reason,
    scope: settings.scope,
    budget: { maxItems: settings.maxItems, maxChars: settings.maxChars },
    timeoutMs: settings.timeoutMs,
    maxSearchesPerTurn: settings.maxSearchesPerTurn,
    inert: choice.tier === 'none' || settings.maxItems <= 0 || settings.maxChars <= 0,
  };
}
