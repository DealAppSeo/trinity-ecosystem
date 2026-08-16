// lib/trustshell/RepIDConfig.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  DEFAULT_WEIGHTS,
  contributionsOf,
  describeCoherence,
  normalizeMetrics,
  scoreFromWeightedSum,
  sumContributions,
  tierForScore,
  weightsProblem,
  type CoherenceReport,
  type RepIDWeights,
} from './repid-scoring';

export type { RepIDWeights };

export interface RepIDCalculationResult {
  repidScore:      number;
  repidTier:       string;
  weightsApplied:  RepIDWeights;
  institutionId:   string;
  meetsThreshold:  boolean;
  threshold:       number;
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
   * Can the score reach the gates it is compared against?
   *
   * Exposed so an operator can ask without running a payment. It is one
   * arithmetic call and it answers the question a green test suite cannot.
   */
  async coherence(institutionId = 'default'): Promise<CoherenceReport> {
    const { data } = await this.supabase
      .from('institution_risk_config')
      .select('min_repid_payment')
      .eq('institution_id', institutionId)
      .single();
    return describeCoherence(data?.min_repid_payment ?? 5000);
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

    const { data: config } = await this.supabase
      .from('institution_risk_config')
      .select('min_repid_payment')
      .eq('institution_id', institutionId)
      .single();

    const threshold = config?.min_repid_payment || 5000;

    return {
      repidScore,
      repidTier,
      weightsApplied: weights,
      institutionId,
      meetsThreshold: repidScore >= threshold,
      threshold,
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
