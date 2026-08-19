// lib/trustshell/harness/quorum.ts — PBFT-style supermajority over expert votes.
//
// "Require a supermajority agreement (usually >66%) among conflicting expert
// agents before committing to a final output answer."
//
// THE OUTCOME IS TRI-STATE. A quorum either COMMITs, REJECTs, or comes back
// INDETERMINATE. Two-valued consensus is the defect this whole codebase keeps
// logging: with only commit and reject, "not enough validators answered"
// collapses into "the proposal was rejected", and a silent infrastructure
// failure is recorded as a considered decision against the proposal.
//
// PBFT tolerates f faults among n validators only when n >= 3f + 1. Below that
// threshold the protocol cannot distinguish a dishonest minority from an
// unlucky one, so a result computed from too few votes is not a weak result —
// it is not a result. `safetyMargin` reports how much headroom the round
// actually had.
//
// Votes are weighted by EARNED reputation. Weighting by anything self-declared
// would let a validator vote itself authoritative, which is the failure the
// reputation layer exists to prevent.

import { BPS_MAX, type Bps, type Clock, type ExpertId } from './types';

export type Verdict = 'approve' | 'reject' | 'abstain';

export interface Vote {
  validator: ExpertId;
  verdict: Verdict;
  /** LEDGER-DERIVED earned reputation, 0..10000. Never self-reported. */
  earnedScore: Bps;
  /** Optional free-text justification, carried into the receipt. */
  rationale?: string;
}

export type QuorumOutcome = 'COMMIT' | 'REJECT' | 'INDETERMINATE';

export interface QuorumConfig {
  /** Fraction of participating weight required to commit. PBFT: > 2/3. */
  supermajority?: number;
  /** Validators that must respond before a round can conclude at all. */
  minValidators?: number;
  /**
   * Require n >= 3f + 1 for the configured fault tolerance `f`.
   * Set 0 to disable the structural check.
   */
  faultTolerance?: number;
}

export interface QuorumResult {
  outcome: QuorumOutcome;
  /** Weight share for the winning side among non-abstaining weight. */
  agreementShare: number;
  approveWeight: number;
  rejectWeight: number;
  abstainWeight: number;
  participatingValidators: number;
  /** Headroom above the supermajority bar. Negative means it was not met. */
  safetyMargin: number;
  /** Duplicate voters, dropped before counting. */
  equivocators: ExpertId[];
  /** Why this outcome, in plain language. */
  basis: string;
  decidedAt: number;
}

const DEFAULTS: Required<QuorumConfig> = {
  supermajority: 2 / 3,
  minValidators: 4,
  faultTolerance: 1,
};

export class QuorumEvaluator {
  private readonly cfg: Required<QuorumConfig>;

  constructor(
    private readonly clock: Clock,
    config: QuorumConfig = {}
  ) {
    this.cfg = { ...DEFAULTS, ...config };
    if (this.cfg.supermajority <= 0.5 || this.cfg.supermajority >= 1) {
      throw new Error('supermajority must be in (0.5, 1)');
    }
  }

  evaluate(votes: Vote[]): QuorumResult {
    const decidedAt = this.clock.now();

    // Equivocation: a validator voting more than once in a round. Both votes
    // are discarded rather than the later one winning — a validator that
    // equivocates has told us its votes are unreliable, so keeping either is a
    // choice we cannot justify.
    const seen = new Map<ExpertId, number>();
    for (const v of votes) seen.set(v.validator, (seen.get(v.validator) ?? 0) + 1);
    const equivocators = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    const equivocatorSet = new Set(equivocators);
    const counted = votes.filter((v) => !equivocatorSet.has(v.validator));

    const clamp = (s: Bps) => Math.max(0, Math.min(BPS_MAX, s));
    let approveWeight = 0;
    let rejectWeight = 0;
    let abstainWeight = 0;
    for (const v of counted) {
      const w = clamp(v.earnedScore);
      if (v.verdict === 'approve') approveWeight += w;
      else if (v.verdict === 'reject') rejectWeight += w;
      else abstainWeight += w;
    }

    const deciding = counted.filter((v) => v.verdict !== 'abstain');
    const decidingWeight = approveWeight + rejectWeight;
    const participatingValidators = deciding.length;

    const indeterminate = (basis: string): QuorumResult => ({
      outcome: 'INDETERMINATE',
      agreementShare: 0,
      approveWeight,
      rejectWeight,
      abstainWeight,
      participatingValidators,
      safetyMargin: -1,
      equivocators,
      basis,
      decidedAt,
    });

    if (participatingValidators < this.cfg.minValidators) {
      return indeterminate(
        `Only ${participatingValidators} validator(s) cast a deciding vote; ${this.cfg.minValidators} are required. ` +
          'This is NOT a rejection — the round could not be decided.'
      );
    }

    if (this.cfg.faultTolerance > 0) {
      const required = 3 * this.cfg.faultTolerance + 1;
      if (participatingValidators < required) {
        return indeterminate(
          `PBFT needs n >= 3f+1 = ${required} validators to tolerate f=${this.cfg.faultTolerance}; ` +
            `only ${participatingValidators} participated. Any result would be unsafe, not merely weak.`
        );
      }
    }

    // All weight abstained, or every validator carries zero earned reputation.
    // Either way there is nothing to divide by, and a 0/0 must not silently
    // become a decision.
    if (decidingWeight === 0) {
      return indeterminate(
        'Total deciding weight is zero — every participant abstained or holds zero earned reputation. ' +
          'No conclusion is available.'
      );
    }

    const approveShare = approveWeight / decidingWeight;
    const rejectShare = rejectWeight / decidingWeight;
    const bar = this.cfg.supermajority;

    if (approveShare > bar) {
      return {
        outcome: 'COMMIT',
        agreementShare: approveShare,
        approveWeight,
        rejectWeight,
        abstainWeight,
        participatingValidators,
        safetyMargin: approveShare - bar,
        equivocators,
        basis: `Approve holds ${(approveShare * 100).toFixed(1)}% of deciding weight across ${participatingValidators} validators, above the ${(bar * 100).toFixed(1)}% bar.`,
        decidedAt,
      };
    }

    if (rejectShare > bar) {
      return {
        outcome: 'REJECT',
        agreementShare: rejectShare,
        approveWeight,
        rejectWeight,
        abstainWeight,
        participatingValidators,
        safetyMargin: rejectShare - bar,
        equivocators,
        basis: `Reject holds ${(rejectShare * 100).toFixed(1)}% of deciding weight across ${participatingValidators} validators, above the ${(bar * 100).toFixed(1)}% bar.`,
        decidedAt,
      };
    }

    // Split decision. Neither side cleared the bar, so the honest answer is
    // that the panel disagreed — not that the proposal lost.
    return {
      outcome: 'INDETERMINATE',
      agreementShare: Math.max(approveShare, rejectShare),
      approveWeight,
      rejectWeight,
      abstainWeight,
      participatingValidators,
      safetyMargin: Math.max(approveShare, rejectShare) - bar,
      equivocators,
      basis:
        `Split: approve ${(approveShare * 100).toFixed(1)}%, reject ${(rejectShare * 100).toFixed(1)}%. ` +
        `Neither cleared the ${(bar * 100).toFixed(1)}% bar, so the panel did not reach consensus. ` +
        'This is NOT a rejection.',
      decidedAt,
    };
  }
}

// ── Rubric-scored judging ────────────────────────────────────────────────────

/**
 * "Run divergent experts in parallel, using a lightweight judge agent to score
 * outputs based on a strict rubrics matrix."
 *
 * The strictness has to be structural, not a prompt instruction. Upstream
 * (kyegomez/swarms `agent_judge.get_reward`) derives a 0/1 reward by searching
 * the conversation for the substrings "correct", "good", "excellent",
 * "perfect" — so "This is NOT correct." scores 1. A rubric that a judge can
 * satisfy with prose is not a rubric.
 *
 * Here a score is only counted when every declared dimension has a numeric
 * value in range. Anything else is an ABSTENTION, never a zero: a judge that
 * failed to answer has told us nothing, and scoring that as "bad" is a
 * fabricated observation.
 */
export interface RubricDimension {
  name: string;
  weight: number;
}

export interface JudgeScore {
  judge: ExpertId;
  /** dimension name -> score in 0..1 */
  dimensions: Record<string, number>;
}

export type ScoreOutcome =
  | { valid: true; weighted: number; judge: ExpertId }
  | { valid: false; judge: ExpertId; reason: string };

export function scoreAgainstRubric(rubric: RubricDimension[], score: JudgeScore): ScoreOutcome {
  if (rubric.length === 0) {
    return { valid: false, judge: score.judge, reason: 'Rubric declares no dimensions.' };
  }

  const totalWeight = rubric.reduce((s, d) => s + d.weight, 0);
  if (totalWeight <= 0) {
    return { valid: false, judge: score.judge, reason: 'Rubric weights sum to zero.' };
  }

  let weighted = 0;
  for (const dim of rubric) {
    const raw = score.dimensions[dim.name];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return {
        valid: false,
        judge: score.judge,
        reason: `Dimension '${dim.name}' is missing or not a finite number. Recorded as an abstention, not a zero.`,
      };
    }
    if (raw < 0 || raw > 1) {
      return {
        valid: false,
        judge: score.judge,
        reason: `Dimension '${dim.name}' scored ${raw}, outside the required 0..1 range.`,
      };
    }
    weighted += (raw * dim.weight) / totalWeight;
  }

  return { valid: true, weighted, judge: score.judge };
}

export interface PanelResult {
  /** Mean weighted score across judges that returned a valid rubric. */
  meanScore: number | null;
  validJudges: number;
  abstentions: Array<{ judge: ExpertId; reason: string }>;
  /** Spread between the highest and lowest valid score. */
  dispersion: number | null;
  basis: string;
}

/**
 * Aggregate a judging panel.
 *
 * `minValidJudges` is the floor below which no mean is reported at all — a
 * single surviving judge is not a panel, and averaging one number produces a
 * confident-looking result with none of a panel's properties.
 */
export function aggregatePanel(
  rubric: RubricDimension[],
  scores: JudgeScore[],
  minValidJudges = 2
): PanelResult {
  const valid: Array<{ judge: ExpertId; weighted: number }> = [];
  const abstentions: Array<{ judge: ExpertId; reason: string }> = [];

  for (const s of scores) {
    const outcome = scoreAgainstRubric(rubric, s);
    if (outcome.valid) valid.push({ judge: outcome.judge, weighted: outcome.weighted });
    else abstentions.push({ judge: outcome.judge, reason: outcome.reason });
  }

  if (valid.length < minValidJudges) {
    return {
      meanScore: null,
      validJudges: valid.length,
      abstentions,
      dispersion: null,
      basis: `Only ${valid.length} valid judge score(s); ${minValidJudges} required. No mean is reported — an average over too few judges is not a panel result.`,
    };
  }

  const values = valid.map((v) => v.weighted);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const dispersion = Math.max(...values) - Math.min(...values);

  return {
    meanScore: mean,
    validJudges: valid.length,
    abstentions,
    dispersion,
    basis:
      `Mean ${mean.toFixed(3)} across ${valid.length} judges, dispersion ${dispersion.toFixed(3)}` +
      (abstentions.length > 0 ? `, ${abstentions.length} abstention(s) excluded.` : '.'),
  };
}
