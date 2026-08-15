// lib/trust/bft-judge.ts
//
// The BFT panel behind the `Judge` port — completing build order step 2.
//
// The `Judge` port exists so a three-provider panel and a single tuned model
// can be swapped without the evaluator noticing. This is the panel side. It
// lives in lib/trust/ rather than in identity/ because it imports `BFTEngine`,
// and identity/ modules are compiled standalone by their suites; an import
// there would drag the engine — and its Supabase dependency — into every one of
// those compiles.
//
// ── THE PANEL'S RISK MODEL IS NON-MONOTONIC, AND THAT CHANGES THE MAPPING ────
//
// The obvious adapter reads "high agreement = confident" and maps it straight
// through. **That is wrong here, and reading the engine rather than assuming it
// is what caught it.**
//
// `checkPythagoreanComma` VETOES when the belief spread is SMALL and average
// belief is HIGH: `comma_gap < 0.05 && avgBelief > 0.85` fires a critical veto
// on the grounds that unanimous high confidence across three different model
// families is evidence of coordinated bias rather than of truth. So the panel
// treats BOTH tails as risk:
//
//   wide spread    →  no consensus            →  nothing established
//   near-zero gap  →  Pythagorean veto        →  escalate to a human
//
// A single `maxDisagreement` ceiling cannot express that — it gates one tail
// and is silent about the other. So this adapter does two separate things and
// says so: it REPORTS `comma_gap` as `disagreement` (the panel's own metric, not
// a second one invented here), and it maps the veto to NOT_CHECKED
// independently of any threshold the operator sets. The ceiling remains the
// operator's knob on the wide-spread tail; the veto is the panel's own call on
// the other, and it is not overridable by leaving a threshold unset.
//
// ── WHAT IS DELIBERATELY NOT CLAIMED ─────────────────────────────────────────
//
// Whether this panel is a BETTER judge of agent work than a single tuned model
// is UNMEASURED (docs/TRUST-HARNESS-DESIGN-2026-08-15.md §4.3). Its track record
// is payment authorization and claim accuracy — different tasks. Nothing here
// asserts otherwise; the point of the port is that the comparison can now be run.

import type { Judge, JudgeOpinion, JudgeRequest } from '@/lib/trustshell/identity/contracted-evaluator';

/**
 * The slice of `BFTEngine` this adapter needs.
 *
 * A structural type rather than the class, so the A/B can run against a
 * recorded panel or a stub without constructing the real engine — which reaches
 * three providers and a database.
 */
export interface VotingPanel {
  vote(
    claim: string,
    context?: string
  ): Promise<{
    consensus_reached: boolean;
    consensus_score: number;
    threshold: number;
    pythagorean_veto_fired: boolean;
    comma_gap: number;
    hitl_required: boolean;
    dissenting_providers: string[];
    votes: { provider: string; belief: number; disbelief: number; weight: number }[];
  }>;
}

export interface BftJudgeOptions {
  /**
   * Cap on how much evidence is put to the panel, in characters.
   *
   * TRUNCATION IS REPORTED, NOT SILENT. A judge that saw half the run and said
   * VERIFIED has not verified the run, so a truncated evidence set weakens the
   * opinion to NOT_CHECKED rather than quietly producing a confident answer over
   * a partial record. Absent means no cap.
   */
  maxEvidenceChars?: number;
}

/**
 * Build the claim the panel votes on.
 *
 * Phrased as a proposition about the WORK, not a question about the agent, and
 * it carries the criterion verbatim from the signed contract. The panel votes
 * belief/disbelief on a claim; giving it anything vaguer than the agreed
 * criterion would have it judging something nobody signed.
 */
export function claimFor(request: JudgeRequest): string {
  const floor =
    request.criterion.minScore === undefined
      ? ''
      : ` It must hold to a standard of at least ${request.criterion.minScore} on a 0-1 scale.`;
  return (
    `The following criterion is SATISFIED by the work described in the evidence. ` +
    `Deliverable: "${request.deliverable}". ` +
    `Criterion '${request.criterion.id}': ${request.criterion.statement}.${floor}`
  );
}

export function createBftJudge(panel: VotingPanel, options: BftJudgeOptions = {}): Judge {
  return {
    async judge(request: JudgeRequest): Promise<JudgeOpinion> {
      const cap = options.maxEvidenceChars;
      const truncated = cap !== undefined && request.evidence.length > cap;
      const evidence = truncated ? request.evidence.slice(0, cap) : request.evidence;

      const result = await panel.vote(claimFor(request), evidence);

      // `comma_gap` is max belief minus min belief across the panel, already in
      // [0, 1]. Reported as-is rather than rescaled: the number a reader can
      // trace back to the engine is worth more than a prettier one they cannot.
      const disagreement = clamp01(result.comma_gap);
      const score = clamp01(result.consensus_score);

      // THE VETO IS NOT NEGOTIABLE BY THRESHOLD. The panel has said the
      // unanimity itself is the warning sign; an operator who left
      // `maxDisagreement` unset must not thereby have opted out of it.
      if (result.pythagorean_veto_fired) {
        return {
          outcome: 'NOT_CHECKED',
          score,
          disagreement,
          // MEASURED, NOT ASSUMED. Without this flag a staged judge read this
          // NOT_CHECKED as "ask the next tier" and a single model turned the
          // veto into a VERIFIED (scripts/panel-tier-test.mjs). The panel's
          // whole claim is that more model opinions are the problem here, so
          // routing it to one more model inverts the finding.
          referToHuman: true,
          detail:
            `the Pythagorean comma veto fired (gap ${result.comma_gap.toFixed(3)}): the panel's ` +
            'three model families agreed too closely and too confidently, which it reads as ' +
            'coordinated bias rather than as truth. This is unestablished, not passed, and it ' +
            'is a human escalation.',
        };
      }

      if (result.hitl_required) {
        return {
          outcome: 'NOT_CHECKED',
          score,
          disagreement,
          // The engine's field is literally named `hitl_required`. Dropping it
          // at this boundary was the loss; carrying it is the whole fix.
          referToHuman: true,
          detail:
            'the panel referred this to a human rather than deciding it, so nothing was ' +
            `established (score ${score.toFixed(3)} against threshold ${result.threshold})`,
        };
      }

      if (result.consensus_reached) {
        if (truncated) {
          // A confident answer over a partial record is the defect this repo is
          // built around, wearing a context window.
          //
          // NO `referToHuman` HERE, AND THAT IS DELIBERATE. This is the one
          // NOT_CHECKED a later tier genuinely CAN settle: a judge with a
          // larger window reads the whole record and answers properly. Flagging
          // it would send resolvable work to a human, which costs the referral
          // signal its meaning.
          return {
            outcome: 'NOT_CHECKED',
            score,
            disagreement,
            detail:
              `the panel reached consensus, but it saw only the first ${cap} characters of the ` +
              'evidence. A judge that read half the run has not judged the run.',
          };
        }
        return {
          outcome: 'VERIFIED',
          score,
          disagreement,
          detail:
            `the panel reached consensus at ${score.toFixed(3)}, above its ${result.threshold} ` +
            `threshold, with a belief spread of ${disagreement.toFixed(3)}` +
            (result.dissenting_providers.length > 0
              ? ` and dissent from ${result.dissenting_providers.join(', ')}`
              : ' and no dissent'),
        };
      }

      // No consensus, no veto, no referral. `hitl_required` is false here only
      // when weighted DISBELIEF cleared the threshold — the panel did not fail
      // to decide, it decided against. That is a FAILED, and collapsing it into
      // NOT_CHECKED would discard the one negative verdict the panel is
      // confident about.
      return {
        outcome: 'FAILED',
        score,
        disagreement,
        detail:
          `the panel affirmatively disbelieved the claim (belief ${score.toFixed(3)}, below the ` +
          `${result.threshold} threshold, with disbelief above it)` +
          (result.dissenting_providers.length > 0
            ? `; dissenting: ${result.dissenting_providers.join(', ')}`
            : ''),
      };
    },
  };
}

/**
 * A judge that is one model, for the A/B against the panel.
 *
 * Deliberately reports NO `disagreement`. A single model has none, and
 * recording 0 would make the cheapest judge look like the most confident one —
 * which would bias the very comparison this exists to enable.
 */
export interface SingleModelJudge {
  assess(claim: string, evidence: string): Promise<{ satisfied: boolean; score?: number; reason: string }>;
}

export function createSingleModelJudge(model: SingleModelJudge): Judge {
  return {
    async judge(request: JudgeRequest): Promise<JudgeOpinion> {
      const claim = claimFor(request);
      const r = await model.assess(claim, request.evidence);
      return {
        outcome: r.satisfied ? 'VERIFIED' : 'FAILED',
        score: r.score === undefined ? undefined : clamp01(r.score),
        // No `disagreement` key at all — see above.
        detail: `single-model judge: ${r.reason}`,
      };
    },
  };
}

/**
 * Clamp into [0, 1], mapping non-numbers to 0.
 *
 * The panel's numbers cross a boundary where the compiler's `number` is a claim
 * about a caller that may not be compiled. A NaN belief reaching a comparison
 * makes every branch false, which would silently route to FAILED.
 */
function clamp01(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
