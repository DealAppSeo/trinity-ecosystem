// lib/trustshell/RepIDConfig.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

import { getSupabaseAdmin } from '@/lib/supabase-admin';

export interface RepIDWeights {
  bftAccuracy:        number;
  veritasCatchRate:   number;
  x402SuccessRate:    number;
  latencyOpportunity: number;
  humanCustodyScore:  number;
}

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
  /**
   * Optional injected client for tests. Still lazy, and deliberately so: this
   * class is instantiated at MODULE SCOPE in
   * `app/api/trustrails/repid/configure/route.ts`, so constructing a client
   * here would run at build time and fail the build (lib/CLAUDE.md).
   */
  constructor(private readonly injectedClient?: ReturnType<typeof getSupabaseAdmin>) {}

  private get supabase() { return this.injectedClient ?? getSupabaseAdmin(); }

  private readonly DEFAULT_WEIGHTS: RepIDWeights = {
    bftAccuracy:        0.40,
    veritasCatchRate:   0.30,
    x402SuccessRate:    0.15,
    latencyOpportunity: 0.10,
    humanCustodyScore:  0.05,
  };

  /**
   * TWO REASONS `data` CAN BE NULL HERE, and only one of them is fine.
   *
   * `.single()` reports PGRST116 when the row simply does not exist — an
   * institution with no custom risk config. Falling back to the defaults is
   * exactly right for that, and it is the common case.
   *
   * Every OTHER error — RLS denial, expired key, transport fault — also
   * produced `data === null` before this change, and so also returned the
   * defaults. That silently replaces an institution's *chosen* risk weights
   * with ours on the path that computes their RepID scores, and nothing
   * anywhere would say so. The weights would look deliberate.
   *
   * So: absent row is a default, unreadable row is loud.
   */
  async getInstitutionWeights(institutionId = 'default'): Promise<RepIDWeights> {
    const { data, error } = await this.supabase
      .from('institution_risk_config')
      .select('repid_weights')
      .eq('institution_id', institutionId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(
        `could not read institution_risk_config for "${institutionId}": ${error.message}. ` +
          `Refusing to fall back to default weights, which would silently overwrite this ` +
          `institution's chosen risk posture with ours.`
      );
    }

    return (data?.repid_weights as RepIDWeights) || this.DEFAULT_WEIGHTS;
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

    const normalized = {
      bft:     rawMetrics.bftAccuracy / 100,
      veritas: rawMetrics.veritasCatchRate / 100,
      x402:    rawMetrics.x402SuccessRate / 100,
      latency: Math.max(0, 1 - rawMetrics.latencyMs / 2000),
      custody: rawMetrics.humanCustody ? 1 : 0,
    };

    const breakdown = {
      bftContribution:     normalized.bft     * weights.bftAccuracy,
      veritasContribution: normalized.veritas  * weights.veritasCatchRate,
      x402Contribution:    normalized.x402     * weights.x402SuccessRate,
      latencyContribution: normalized.latency  * weights.latencyOpportunity,
      custodyContribution: normalized.custody  * weights.humanCustodyScore,
    };

    const weightedSum = Object.values(breakdown).reduce((s, v) => s + v, 0);

    const repidScore = Math.min(10000, Math.max(0,
      Math.floor(2000 * Math.log10(1 + weightedSum * 100))
    ));

    const repidTier =
      repidScore >= 7500 ? 'Platinum' :
      repidScore >= 5000 ? 'Gold'     :
      repidScore >= 2500 ? 'Silver'   : 'Bronze';

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
    const sum     = Object.values(merged).reduce((s, v) => s + v, 0);

    if (Math.abs(sum - 1.0) > 0.01) {
      throw new Error(`Weights must sum to 1.0. Current sum: ${sum.toFixed(2)}`);
    }

    await this.supabase
      .from('institution_risk_config')
      .upsert({
        institution_id: institutionId,
        repid_weights:  merged,
        updated_at:     new Date().toISOString(),
      });
  }
}
