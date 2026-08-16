// lib/trustshell/RepIDConfig.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  DEFAULT_WEIGHTS,
  contributionsOf,
  describeCoherence,
  normalizeMetrics,
  reachableCeiling,
  resolvePaymentThreshold,
  scoreFromWeightedSum,
  sumContributions,
  tierForScore,
  weightsProblem,
  type CoherenceReport,
  type RepIDWeights,
  type ThresholdResolution,
} from './repid-scoring';

export type { RepIDWeights };

export interface RepIDCalculationResult {
  repidScore:      number;
  repidTier:       string;
  weightsApplied:  RepIDWeights;
  institutionId:   string;
  /** `null` when the threshold could not be resolved — NOT_CHECKED, not false. */
  meetsThreshold:  boolean | null;
  /** `null` for the same reason. Never a substituted default. */
  threshold:       number | null;
  /** Where the threshold came from, so a reader can tell configured from assumed. */
  thresholdSource: ThresholdResolution['source'];
  thresholdDetail: string;
  breakdown: {
    bftContribution:        number;
    veritasContribution:    number;
    x402Contribution:       number;
    latencyContribution:    number;
    custodyContribution:    number;
  };
}

export class RepIDCalculator {
  private get supabase() { return getSupabaseAdmin(); }

  private readonly DEFAULT_WEIGHTS: RepIDWeights = DEFAULT_WEIGHTS;

  /**
   * Weights for an institution, VALIDATED ON READ.
   *
   * The stored value is checked with the same rule the setter applies, because
   * the setter is not the only writer — a migration or another service can put
   * anything in `institution_risk_config`. Weights that do not sum to 1 break
   * the score's range, which is the one route to a tier the honest maximum
   * cannot reach. Unusable stored weights fall back to the defaults rather than
   * throwing, since this sits on a gate's read path, but the fallback is a
   * deliberate substitution rather than the `|| DEFAULT` coincidence it was.
   */
  async getInstitutionWeights(institutionId = 'default'): Promise<RepIDWeights> {
    const { data } = await this.supabase
      .from('institution_risk_config')
      .select('repid_weights')
      .eq('institution_id', institutionId)
      .single();
    const stored = data?.repid_weights;
    if (stored === undefined || stored === null) return this.DEFAULT_WEIGHTS;
    return weightsProblem(stored) === null ? (stored as RepIDWeights) : this.DEFAULT_WEIGHTS;
  }

  /**
   * The payment threshold for an institution — the ONE read.
   *
   * `coherence()` and `calculate()` both come through here. They used to read
   * `min_repid_payment` separately, with `??` in one and `||` in the other, so
   * a stored **0** made the coherence report describe a threshold of 0 while
   * the gate enforced 5000. See `resolvePaymentThreshold` for the whole story.
   *
   * THE QUERY ERROR IS CAPTURED, not discarded. Both call sites previously did
   * `const { data } = await …`, so an unreadable config silently became 5000 —
   * which LOWERS the bar for any institution that had stored a stricter one.
   */
  private async readPaymentThreshold(institutionId: string): Promise<ThresholdResolution> {
    const { data, error } = await this.supabase
      .from('institution_risk_config')
      .select('min_repid_payment')
      .eq('institution_id', institutionId)
      .single();

    // PGRST116 is "no rows", which is a legitimately absent configuration, not
    // a failed read. Anything else means we could not look.
    const readable = !error || error.code === 'PGRST116';
    return resolvePaymentThreshold(data?.min_repid_payment, readable);
  }

  /**
   * Can the score reach the gates it is compared against?
   *
   * Exposed so an operator can ask without running a payment. It is one
   * arithmetic call and it answers the question a green test suite cannot.
   *
   * Reports on the SAME threshold `calculate()` will enforce, which is the
   * point — a coherence report about a different number than the gate uses is
   * worse than no report, because it reads as reassurance.
   */
  async coherence(institutionId = 'default'): Promise<CoherenceReport> {
    const resolved = await this.readPaymentThreshold(institutionId);
    if (resolved.threshold === null) {
      return {
        outcome: 'NOT_CHECKED',
        ceiling: reachableCeiling(),
        gatesConsidered: [],
        unreachable: [],
        detail: `coherence was not evaluated: ${resolved.detail}`,
      };
    }
    return describeCoherence(resolved.threshold);
  }

  async calculate(
    agentName: string,
    rawMetrics: {
      bftAccuracy:      number;
      veritasCatchRate: number;
      x402SuccessRate:  number;
      latencyMs:        number;
      humanCustody:     boolean;
    },
    institutionId = 'default'
  ): Promise<RepIDCalculationResult> {

    const weights = await this.getInstitutionWeights(institutionId);

    const normalized = normalizeMetrics(rawMetrics);
    const breakdown = contributionsOf(normalized, weights);
    const weightedSum = sumContributions(breakdown);
    const repidScore = scoreFromWeightedSum(weightedSum);
    const repidTier = tierForScore(repidScore);

    const resolved = await this.readPaymentThreshold(institutionId);

    return {
      repidScore,
      repidTier,
      weightsApplied: weights,
      institutionId,
      // `null` when the threshold could not be resolved. A boolean here would
      // force an unknown to be reported as one of the two answers, and the
      // convenient one is `true` — the same shape as `withinDailyLimit`, on the
      // same payment path.
      meetsThreshold: resolved.threshold === null ? null : repidScore >= resolved.threshold,
      threshold: resolved.threshold,
      thresholdSource: resolved.source,
      thresholdDetail: resolved.detail,
      breakdown,
    };
  }

  async updateInstitutionWeights(
    institutionId: string,
    weights:       Partial<RepIDWeights>
  ): Promise<void> {
    const current = await this.getInstitutionWeights(institutionId);
    const merged  = { ...current, ...weights };

    // Same rule the reader applies. One validator, so the two cannot drift.
    const problem = weightsProblem(merged);
    if (problem !== null) throw new Error(`refusing to store these weights: ${problem}`);

    await this.supabase
      .from('institution_risk_config')
      .upsert({
        institution_id: institutionId,
        repid_weights:  merged,
        updated_at:     new Date().toISOString(),
      });
  }
}
