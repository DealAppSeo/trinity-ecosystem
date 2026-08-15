// lib/trustshell/identity/outcome-to-reputation.ts
//
// The evidence-vs-progress discriminator: what a verdict is allowed to do to
// reputation, and — more often than expected — what it is not.
//
// Build order step 5. "Only verified outcomes move reputation. A rejected
// attempt is evidence, not progress — and it is RECORDED, not discarded."
//
// ── WHY THIS IS NOT A FIELD ON ReputationEvent ───────────────────────────────
//
// The obvious implementation adds `isProgress` to `ReputationEvent`. That would
// change the canonical encoding, which is the transition circuit's public input
// and the interop spec already handed to the other lane. A wire-format change
// is a cross-lane decision, and this one is unnecessary: **direction is already
// in the signal name.** `bft_vote_correct`/`bft_vote_incorrect`,
// `veritas_catch`/`veritas_miss`, `x402_settled`/`x402_failed` are three
// deliberate pairs. The discriminator is therefore a total function over a
// closed set, and no bytes move.
//
// ── THE GAP THIS FILE REFUSES TO PAPER OVER ──────────────────────────────────
//
// **There is no signal for "an agent completed a unit of work that was
// independently verified."** The closed set measures judgement accuracy
// (`bft_vote_*`, `veritas_*`), settlement reliability (`x402_*`) and latency.
// A doer whose work passes every agreed criterion earns NOTHING, because there
// is nothing for it to earn.
//
// That is not an oversight in this file — it is the measured shape of RepID,
// and it is the reason the Generator seat is chosen by CONTEXT rather than rank
// (docs/TRUST-HARNESS-DESIGN-2026-08-15.md §1.1): ranking a generator by a
// score that only tracks judging and settling puts the best judge in the wrong
// chair. Closing it means adding a signal to a closed set that the other lane's
// circuit consumes, which is that lane's call and not this one's.
//
// So the gap is returned, not hidden. `withheld` names every signal that was
// NOT emitted and why, on every call. A caller that wires this up sees the hole
// in its own output rather than in a comment nobody reads — which is the only
// version of "known limitation" that survives contact with a dashboard.
//
// ── A VERDICT CANNOT PAY ITS OWN AUTHOR ──────────────────────────────────────
//
// `veritas_catch` requires a `GroundTruthObservation` from outside, enforced in
// `work-contract.ts`. This file never reaches around that: there is no path
// here from a verdict to a checker's reward without an observation, because
// rendering verdicts would otherwise be a way to earn reputation, which is
// self-certification one layer up and the failure the whole design exists to
// prevent.

import type { ReputationEvent, ReputationSignal } from './reputation-transition';
import { REPUTATION_SIGNALS } from './reputation-transition';
import {
  veritasSignal,
  type GroundTruthObservation,
  type Verdict,
  type VerdictVerification,
} from './work-contract';

/**
 * What an event is, for the purposes of "only verified outcomes move progress".
 *
 * Three kinds, and the middle one carries the design. `evidence` is RECORDED —
 * it enters the append-only history and moves the score down — it simply does
 * not count as progress. Discarding rejected attempts would make failure
 * invisible, and a history that only remembers successes is a history nobody
 * can audit.
 */
export type ProgressKind =
  /** Verified, and it advances the subject's standing. */
  | 'progress'
  /** Recorded, moves the score DOWN, and is explicitly not progress. */
  | 'evidence'
  /** A measurement, not a judgement. Neither advances nor penalises. */
  | 'neither';

/**
 * The partition, stated exhaustively.
 *
 * `Record<ReputationSignal, …>` rather than a lookup with a default: a signal
 * added to the closed set without a kind here fails to compile, which is the
 * only way this stays total. A default would silently classify a new signal as
 * whatever the default is, and the natural default — `neither` — would make an
 * unclassified signal weightless without anybody noticing.
 */
export const SIGNAL_KIND: Record<ReputationSignal, ProgressKind> = {
  bft_vote_correct: 'progress',
  bft_vote_incorrect: 'evidence',
  veritas_catch: 'progress',
  veritas_miss: 'evidence',
  x402_settled: 'progress',
  x402_failed: 'evidence',
  // NOT progress, however good the number. A fast agent is not a correct one,
  // and letting latency earn standing would make speed a route to trust.
  latency_sample: 'neither',
};

export function isProgress(signal: ReputationSignal): boolean {
  return SIGNAL_KIND[signal] === 'progress';
}

/** A signal that was deliberately NOT emitted, with the reason. */
export interface WithheldSignal {
  /** Who would have earned it. */
  subject: string;
  /**
   * The signal that would have been emitted, or `null` when the closed set has
   * no signal for what happened. `null` is the interesting case — it means the
   * vocabulary is missing a word, not that a rule refused.
   */
  signal: ReputationSignal | null;
  reason: string;
}

export interface ReputationOutcome {
  /** Events to append. May be empty, and empty is a normal result. */
  events: readonly ReputationEvent[];
  /** What was not emitted and why. Never empty in practice — see the header. */
  withheld: readonly WithheldSignal[];
}

export interface VerdictReputationInput {
  verdict: Verdict;
  /** From `verifyVerdict`. A verdict that did not verify moves nothing. */
  verification: VerdictVerification;
  /** The hash `verifyVerdict` computed, for binding an observation. */
  verdictHash: string;
  /** Who did the work. */
  doerDid: string;
  /**
   * A later, independent answer about the same work.
   *
   * ABSENT IS THE COMMON CASE and it is not an error. Without it the checker
   * earns nothing, which is correct: nothing yet establishes whether the
   * verdict was right.
   */
  observation?: GroundTruthObservation;
  observedAt: string;
}

/**
 * Turn a verified verdict into the reputation events it actually justifies.
 *
 * Deliberately stingy. Most calls return zero events and several withheld
 * entries, and that is the design working rather than a bug: the number of
 * things a single verdict genuinely proves about anybody is small.
 */
export function reputationForVerdict(input: VerdictReputationInput): ReputationOutcome {
  const { verdict, verification, verdictHash, doerDid, observation, observedAt } = input;
  const events: ReputationEvent[] = [];
  const withheld: WithheldSignal[] = [];

  // A verdict whose signature or contract binding failed says nothing about
  // anyone. Scoring off it would let a forged verdict move a real score.
  if (verification.outcome === 'NOT_CHECKED' || !verification.signatureValid || !verification.boundToContract) {
    return {
      events: [],
      withheld: [
        {
          subject: doerDid,
          signal: null,
          reason: `the verdict did not verify, so it establishes nothing about the work: ${verification.detail}`,
        },
        {
          subject: verdict.checkerDid,
          signal: null,
          reason: 'a verdict that does not verify cannot grade its checker either',
        },
      ],
    };
  }

  // ── The doer ─────────────────────────────────────────────────────────────
  //
  // THE GAP, surfaced on every call. There is no signal for verified work, so
  // a doer whose work passed every agreed criterion earns nothing. Returning
  // this rather than omitting it is the whole point: a caller building a
  // dashboard sees an explicit "nothing was earned, and here is why" instead of
  // an empty array that reads as "no activity".
  if (verification.outcome === 'VERIFIED') {
    withheld.push({
      subject: doerDid,
      signal: null,
      reason:
        'the work was independently VERIFIED, but the closed signal set has no signal for ' +
        'completing verified work — it measures judgement accuracy, settlement and latency. ' +
        'Adding one changes the transition circuit\'s public inputs and is a cross-lane decision.',
    });
  } else if (verification.outcome === 'FAILED') {
    // Symmetrically absent. A failed unit of work is evidence and ought to be
    // recorded against the doer; the same missing vocabulary prevents it, and
    // pretending otherwise by reusing an unrelated signal would corrupt what
    // that signal means.
    withheld.push({
      subject: doerDid,
      signal: null,
      reason:
        'the work FAILED and should be recorded as evidence against the doer, but the closed ' +
        'signal set has no signal for failed work. Reusing an unrelated signal would corrupt ' +
        'what that signal measures.',
    });
  }

  // ── The checker ──────────────────────────────────────────────────────────
  //
  // This is the half the vocabulary DOES cover, and it is gated on an outside
  // observation by construction — `veritasSignal` has no one-argument form.
  if (!observation) {
    withheld.push({
      subject: verdict.checkerDid,
      signal: null,
      reason:
        'no ground-truth observation accompanies this verdict, so whether the checker was ' +
        'right is unestablished. A checker must not earn reputation for rendering verdicts.',
    });
    return { events, withheld };
  }

  // Throws when the observer is the checker being graded. Deliberately NOT
  // caught: that is a caller bug — an attempt to launder self-certification
  // through a ground-truth field — and swallowing it would turn a loud refusal
  // into a silently empty result.
  const signal = veritasSignal(verdict, verdictHash, observation);

  if (signal === null) {
    withheld.push({
      subject: verdict.checkerDid,
      signal: null,
      reason:
        'the observation does not grade this verdict — either it names a different verdict, ' +
        'or one side is NOT_CHECKED. An honest "I could not look" is not a wrong answer, and ' +
        'scoring it as one would teach the checker to guess.',
    });
    return { events, withheld };
  }

  events.push({
    subject: verdict.checkerDid,
    signal,
    observedAt,
  });

  return { events, withheld };
}

/**
 * Split appended events into what advanced standing and what merely recorded.
 *
 * The read-side counterpart. A consumer that wants "how much progress has this
 * agent made" must not count `bft_vote_incorrect` toward it, and the only thing
 * standing between it and that mistake is this partition.
 */
export function partitionByProgress(events: readonly ReputationEvent[]): {
  progress: readonly ReputationEvent[];
  evidence: readonly ReputationEvent[];
  neither: readonly ReputationEvent[];
} {
  const progress: ReputationEvent[] = [];
  const evidence: ReputationEvent[] = [];
  const neither: ReputationEvent[] = [];
  for (const event of events) {
    const kind = SIGNAL_KIND[event.signal];
    if (kind === 'progress') progress.push(event);
    else if (kind === 'evidence') evidence.push(event);
    else neither.push(event);
  }
  return { progress, evidence, neither };
}

/**
 * Every signal in the closed set has a kind.
 *
 * Asserted at runtime as well as in the type, because the union is erased at
 * any boundary the events cross — a signal arriving over HTTP is `any`, and
 * `SIGNAL_KIND[unknown]` is `undefined`, which would classify it as none of the
 * three while looking like it worked.
 */
export function assertPartitionTotal(): void {
  for (const signal of REPUTATION_SIGNALS) {
    if (!['progress', 'evidence', 'neither'].includes(SIGNAL_KIND[signal])) {
      throw new Error(
        `signal '${signal}' has no progress kind. A signal that is neither progress nor ` +
          'evidence nor a measurement is weightless, and weightless is what an unclassified ' +
          'signal silently becomes.'
      );
    }
  }
}
