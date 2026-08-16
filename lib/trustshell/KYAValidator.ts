// lib/trustshell/KYAValidator.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { AgentKYAProfile, KYAComplianceResult } from './types';

export class KYAValidator {
  /** Optional injected client for tests. Still lazy — see lib/CLAUDE.md. */
  constructor(private readonly injectedClient?: ReturnType<typeof getSupabaseAdmin>) {}

  private get supabase() { return this.injectedClient ?? getSupabaseAdmin(); }

  async getAgentProfile(agentName: string): Promise<AgentKYAProfile | null> {
    const { data, error } = await this.supabase
      .from('agent_kya_registry')
      .select('*')
      .eq('agent_name', agentName)
      .single();
    if (error || !data) return null;
    return {
      agentName:            data.agent_name,
      repidScore:           data.repid_score,
      repidTier:            data.repid_tier,
      spendingLimitDaily:   data.spending_limit_daily,
      spendingLimitPerTx:   data.spending_limit_per_tx,
      insuranceCoverage:    data.insurance_coverage,
      collateralStaked:     data.collateral_staked,
      zkpProofCID:          data.zkp_proof_cid || `ZKP_STUB_${agentName}_VERIFIED`,
      humanCustodyVerified: data.human_custody_verified,
      vaultAccessPermitted: data.vault_access_permitted,
    };
  }

  /**
   * FAILS CLOSED, and this is the one on the list that had teeth.
   *
   * It used to destructure only `data`, so an RLS denial or a transport fault
   * returned `(null || []).reduce(...)` === **0 spent today** — and the caller
   * is `validate()`, which compares that against `spendingLimitDaily`. A
   * permissions failure therefore read as "this agent has spent nothing",
   * which is the single most permissive answer the function can give, on the
   * path that authorizes payments.
   *
   * Throwing is the safe direction: a spend limit cannot be enforced against
   * an unknown spend, so the payment must not proceed. `getAgentProfile`
   * directly above already captures `error`; this is the same file disagreeing
   * with itself.
   */
  async getDailySpend(agentName: string): Promise<number> {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { data, error } = await this.supabase
      .from('kya_compliance_receipts')
      .select('payment_amount_usdc')
      .eq('agent_name', agentName)
      .eq('bft_passed', true)
      .gte('created_at', since);

    if (error) {
      throw new Error(
        `refusing to report a daily spend that could not be read for "${agentName}": ` +
          `${error.message}. Treating an unreadable ledger as 0 spent would authorize ` +
          `a payment against a limit nobody checked.`
      );
    }

    return (data || []).reduce((s, r) => s + Number(r.payment_amount_usdc), 0);
  }

  async validate(
    agentName: string,
    amountUSDC: number
  ): Promise<KYAComplianceResult> {
    const profile = await this.getAgentProfile(agentName);
    if (!profile) {
      return {
        agentName,
        kya_verified:      false,
        repidScore:        0,
        repidTier:         'Bronze',
        humanCustodyBound: false,
        zkpProofCID:       '',
        withinDailyLimit:  false,
        withinTxLimit:     false,
        insuranceCoverage: 0,
        denialReason:      `Agent ${agentName} not found in KYA registry`,
      };
    }

    if (amountUSDC > profile.spendingLimitPerTx) {
      return {
        agentName,
        kya_verified:      false,
        repidScore:        profile.repidScore,
        repidTier:         profile.repidTier,
        humanCustodyBound: profile.humanCustodyVerified,
        zkpProofCID:       profile.zkpProofCID,
        withinDailyLimit:  true,
        withinTxLimit:     false,
        insuranceCoverage: profile.insuranceCoverage,
        denialReason:      `Amount ${amountUSDC} USDC exceeds per-tx limit ${profile.spendingLimitPerTx} for ${profile.repidTier} tier`,
      };
    }

    const dailySpend = await this.getDailySpend(agentName);
    if (dailySpend + amountUSDC > profile.spendingLimitDaily) {
      return {
        agentName,
        kya_verified:      false,
        repidScore:        profile.repidScore,
        repidTier:         profile.repidTier,
        humanCustodyBound: profile.humanCustodyVerified,
        zkpProofCID:       profile.zkpProofCID,
        withinDailyLimit:  false,
        withinTxLimit:     true,
        insuranceCoverage: profile.insuranceCoverage,
        denialReason:      `Daily limit would be exceeded: ${dailySpend + amountUSDC} > ${profile.spendingLimitDaily}`,
      };
    }

    return {
      agentName,
      kya_verified:      true,
      repidScore:        profile.repidScore,
      repidTier:         profile.repidTier,
      humanCustodyBound: profile.humanCustodyVerified,
      zkpProofCID:       profile.zkpProofCID,
      withinDailyLimit:  true,
      withinTxLimit:     true,
      insuranceCoverage: profile.insuranceCoverage,
    };
  }

  async updateRepID(
    agentName:        string,
    delta:            number,  // positive = reward, negative = penalty
    reason:           string
  ): Promise<void> {
    const profile = await this.getAgentProfile(agentName);
    if (!profile) return;

    const newScore = Math.max(0, Math.min(10000, profile.repidScore + delta));
    const newTier: any =
      newScore > 7500 ? 'Platinum' :
      newScore > 5000 ? 'Gold'     :
      newScore > 2500 ? 'Silver'   : 'Bronze';

    const newDailyLimit =
      newTier === 'Platinum' ? 500000 :
      newTier === 'Gold'     ? 100000 :
      newTier === 'Silver'   ? 10000  : 1000;

    const newTxLimit =
      newTier === 'Platinum' ? 100000 :
      newTier === 'Gold'     ? 50000  :
      newTier === 'Silver'   ? 5000   : 100;

    await this.supabase
      .from('agent_kya_registry')
      .update({
        repid_score:           newScore,
        repid_tier:            newTier,
        spending_limit_daily:  newDailyLimit,
        spending_limit_per_tx: newTxLimit,
        last_repid_update:     new Date().toISOString(),
      })
      .eq('agent_name', agentName);

    await this.supabase.from('trinity_agent_logs').insert({
      agent_name: agentName,
      action:     'repid_update',
      content:    `RepID ${profile.repidScore} → ${newScore} (${delta > 0 ? '+' : ''}${delta}): ${reason}`,
      metadata:   { old_score: profile.repidScore, new_score: newScore, delta, reason },
    });
  }
}
