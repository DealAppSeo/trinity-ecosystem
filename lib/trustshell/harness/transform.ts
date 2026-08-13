// lib/trustshell/harness/transform.ts — middle-out context compression.
//
// "Context bloat: the conversation grows until it crowds out the task."
//
// The model is LangGraph's message transforms: keep the head and the tail, drop
// from the middle, because the middle is where relevance decays fastest. The
// head carries the task framing and the tail carries what just happened; the
// turns in between are usually the most disposable thing in the window.
//
// THE POINT OF THIS FILE IS THE REPORTED RATIO, NOT THE DROPPING. Dropping
// context is easy. Dropping it *silently* is the "silent expert degradation"
// failure wearing different clothes: answers get worse, the operator sees a
// smaller prompt and a green metric, and nothing anywhere says that half the
// conversation was discarded. Every result here carries what went in, what came
// out, what was dropped by id, and why — so a caller can watch quality fall and
// attribute it.
//
// THREE THINGS THAT MUST NOT HAPPEN, each of which looks like success:
//
//   * DROPPING PINNED CONTENT TO HIT A BUDGET. Discarding the system prompt
//     will always make the numbers fit. It also destroys the task while
//     reporting an excellent compression ratio.
//   * SILENTLY RETURNING OVER BUDGET. When pinned + head + tail already exceed
//     the budget, there is no compression that fits. Returning it anyway with
//     no flag reports "we did not look" as "it passed". `withinBudget` is the
//     third outcome that keeps those distinct.
//   * SPLITTING A TOOL CALL FROM ITS RESULT. This is the subtle one, and it is
//     the shape that has bitten this codebase three times today: the fix for
//     one problem quietly introduces another. Compressing by token count alone
//     will happily drop a tool call and keep its result, leaving a malformed
//     conversation that reads as a model bug rather than a transform bug.
//     Paired messages are retained or dropped together, never split.
//
// The ratio is measured in the SAME UNIT as the budget. A ratio computed on
// message count while the budget is expressed in tokens is the wrong-metric
// defect that produced a spurious Kendall tau earlier today — it would report
// 50% compression for dropping ten one-word messages while the window stayed
// full.

import type { Clock } from '@/lib/trustshell/harness/types';

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface HarnessMessage {
  id: string;
  role: MessageRole;
  content: string;
  /**
   * Never dropped, whatever the budget says. Use for the system prompt and
   * anything else whose absence changes the task rather than the detail.
   */
  pinned?: boolean;
  /**
   * Links a tool call to its result. Messages sharing a `pairId` are retained
   * together or dropped together — never split.
   */
  pairId?: string;
}

/** Counts tokens for a string. Injected, so this file stays dependency-free. */
export type TokenEstimator = (text: string) => number;

/**
 * Rough default: four characters per token.
 *
 * Deliberately crude and deliberately explicit. A caller with a real tokenizer
 * should pass one; what matters is that the SAME estimator measures both the
 * budget and the ratio, so the two can never disagree about what a token is.
 */
export const approximateTokens: TokenEstimator = (text) => Math.ceil(text.length / 4);

export interface TransformConfig {
  /** Token budget for the whole retained message list. */
  maxTokens: number;
  /** Non-pinned messages always kept at the start. */
  headKeep: number;
  /** Non-pinned messages always kept at the end. */
  tailKeep: number;
  /**
   * Optional summariser for the dropped middle. Its output is inserted as one
   * assistant message and ITS TOKENS ARE COUNTED — a summary that is not
   * charged against the budget is how a compressor reports a ratio it did not
   * achieve.
   */
  summarise?: (dropped: HarnessMessage[]) => string;
}

export interface TransformResult {
  messages: HarnessMessage[];
  originalTokens: number;
  retainedTokens: number;
  /**
   * `retainedTokens / originalTokens`, 0..1.
   *
   * 1.0 means nothing was removed; 0.25 means the result is a quarter the size
   * of the input. Stated as a fraction rather than an "N× compression" figure
   * because the direction of the latter is ambiguous and this number is meant
   * to be logged and compared across runs.
   */
  compressionRatio: number;
  droppedIds: string[];
  droppedTokens: number;
  summaryInserted: boolean;
  /**
   * False when the result still exceeds `maxTokens` after everything droppable
   * has been dropped. NOT an error — the caller may still want the messages —
   * but it must never be mistaken for a successful fit.
   */
  withinBudget: boolean;
  /** Why the result looks the way it does, in plain language. */
  basis: string;
  /** When the transform ran. */
  transformedAt: number;
}

export class ContextTransformer {
  private readonly estimate: TokenEstimator;

  constructor(
    private readonly clock: Clock,
    private readonly cfg: TransformConfig,
    estimator: TokenEstimator = approximateTokens
  ) {
    if (cfg.maxTokens <= 0) throw new Error('maxTokens must be > 0');
    if (cfg.headKeep < 0) throw new Error('headKeep must be >= 0');
    if (cfg.tailKeep < 0) throw new Error('tailKeep must be >= 0');
    this.estimate = estimator;
  }

  private tokensOf(messages: HarnessMessage[]): number {
    let n = 0;
    for (const m of messages) n += this.estimate(m.content);
    return n;
  }

  /**
   * Compress `messages` to fit the budget, keeping head and tail.
   *
   * Order is always preserved. The returned list is a new array; the input is
   * never mutated.
   */
  transform(messages: HarnessMessage[]): TransformResult {
    const now = this.clock.now();
    const originalTokens = this.tokensOf(messages);

    const unchanged = (basis: string): TransformResult => ({
      messages: [...messages],
      originalTokens,
      retainedTokens: originalTokens,
      compressionRatio: originalTokens === 0 ? 1 : 1,
      droppedIds: [],
      droppedTokens: 0,
      summaryInserted: false,
      withinBudget: originalTokens <= this.cfg.maxTokens,
      basis,
      transformedAt: now,
    });

    if (originalTokens <= this.cfg.maxTokens) {
      return unchanged(
        `No compression needed: ${originalTokens} tokens is within the ${this.cfg.maxTokens} budget.`
      );
    }

    // Partition. Pinned messages are removed from positional consideration
    // entirely — a pinned message in the middle is still pinned.
    const droppableIdx: number[] = [];
    for (let i = 0; i < messages.length; i += 1) {
      if (!messages[i].pinned) droppableIdx.push(i);
    }

    // Head and tail are carved out of the droppable positions, not out of the
    // raw list, so pinned messages do not consume the head/tail allowance.
    const protectedIdx = new Set<number>();
    for (let i = 0; i < messages.length; i += 1) if (messages[i].pinned) protectedIdx.add(i);
    for (let i = 0; i < Math.min(this.cfg.headKeep, droppableIdx.length); i += 1) {
      protectedIdx.add(droppableIdx[i]);
    }
    for (let i = 0; i < Math.min(this.cfg.tailKeep, droppableIdx.length); i += 1) {
      protectedIdx.add(droppableIdx[droppableIdx.length - 1 - i]);
    }

    // Anything left is middle, and therefore a drop candidate.
    const middleIdx = droppableIdx.filter((i) => !protectedIdx.has(i));

    // Pair integrity. A candidate whose pair has any protected member cannot be
    // dropped, because dropping it would split the pair. Candidates whose pair
    // lies entirely in the middle are grouped so they drop as a unit.
    const protectedPairs = new Set<string>();
    for (const i of protectedIdx) {
      const p = messages[i].pairId;
      if (p !== undefined) protectedPairs.add(p);
    }

    const groups: number[][] = [];
    const seenPair = new Map<string, number>();
    const pinnedByPair: number[] = [];
    for (const i of middleIdx) {
      const p = messages[i].pairId;
      if (p === undefined) {
        groups.push([i]);
        continue;
      }
      if (protectedPairs.has(p)) {
        // Its partner survives, so this must too.
        pinnedByPair.push(i);
        continue;
      }
      const at = seenPair.get(p);
      if (at === undefined) {
        seenPair.set(p, groups.length);
        groups.push([i]);
      } else {
        groups[at].push(i);
      }
    }

    // Drop oldest-first: the middle decays from the front, which is what makes
    // this middle-OUT rather than simply truncating the tail.
    const dropped = new Set<number>();
    let retained = originalTokens;
    for (const g of groups) {
      if (retained <= this.cfg.maxTokens) break;
      for (const i of g) {
        dropped.add(i);
        retained -= this.estimate(messages[i].content);
      }
    }

    const droppedMessages = messages.filter((_, i) => dropped.has(i));
    let out = messages.filter((_, i) => !dropped.has(i));

    // The summary is charged against the budget. A summary counted as free is
    // a compressor reporting a ratio it did not achieve.
    let summaryInserted = false;
    if (this.cfg.summarise && droppedMessages.length > 0) {
      const text = this.cfg.summarise(droppedMessages);
      if (text.length > 0) {
        const summary: HarnessMessage = {
          id: `summary:${droppedMessages[0].id}..${droppedMessages[droppedMessages.length - 1].id}`,
          role: 'assistant',
          content: text,
        };
        // Insert where the dropped middle used to begin, preserving order.
        const firstDropped = Math.min(...dropped);
        const before = messages.slice(0, firstDropped).filter((_, i) => !dropped.has(i));
        out = [...before, summary, ...out.slice(before.length)];
        retained += this.estimate(text);
        summaryInserted = true;
      }
    }

    const withinBudget = retained <= this.cfg.maxTokens;

    let basis: string;
    if (withinBudget) {
      basis =
        `Dropped ${droppedMessages.length} middle message(s) to reach ${retained}/${this.cfg.maxTokens} tokens` +
        `, keeping ${this.cfg.headKeep} head and ${this.cfg.tailKeep} tail` +
        `${pinnedByPair.length > 0 ? ` and ${pinnedByPair.length} message(s) held by pair integrity` : ''}` +
        `${summaryInserted ? ', summary inserted and charged' : ''}.`;
    } else {
      // The floor must be named in full. Listing only pinned/head/tail while
      // pair-held messages also refused to move sends the operator to raise a
      // limit that was never the binding constraint.
      const floor = messages.filter((m) => m.pinned).length;
      basis =
        `OVER BUDGET: ${retained} tokens against a ${this.cfg.maxTokens} budget after dropping everything droppable. ` +
        `${floor} pinned message(s) plus ${this.cfg.headKeep} head and ${this.cfg.tailKeep} tail` +
        `${pinnedByPair.length > 0 ? ` plus ${pinnedByPair.length} message(s) held by pair integrity` : ''}` +
        ` are the floor and were not touched. ` +
        `Raise maxTokens, reduce headKeep/tailKeep, ` +
        `${pinnedByPair.length > 0 ? 'split the paired messages, ' : ''}or unpin something.`;
    }

    return {
      messages: out,
      originalTokens,
      retainedTokens: retained,
      compressionRatio: originalTokens === 0 ? 1 : retained / originalTokens,
      droppedIds: droppedMessages.map((m) => m.id),
      droppedTokens: this.tokensOf(droppedMessages),
      summaryInserted,
      withinBudget,
      basis,
      transformedAt: now,
    };
  }
}
