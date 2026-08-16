// lib/trustshell/KYAValidator.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { AgentKYAProfile, KYAComplianceResult } from './types';
import {
  TIER_LIMITS,
  checkDailyLimit,
  checkPerTxLimit,
  tierForScore,
  REPID_MIN,
  REPID_MAX,
} from './repid-scoring';

export class KYAValidator {
  private get supabase() { return getSupabaseAdmin(); }

  /**
   * Look up an agent, distinguishing ABSENT from UNREADABLE.
   *
   * The original returned `null` for both, and `validate` rendered that as
   * "Agent X not found in KYA registry" — a false statement about the registry
   * whenever the real cause was a database error, written into a compliance
   * receipt as the reason for a denial. Both still deny; only one of them is
   * true. `unreadable` is what lets the caller say which.
   */
  async lookupAgent(
    agentName: string
  ): Promise<{ profile: AgentKYAProfile | null; unreadable: string | null }> {
    const { data, error } = await this.supabase
      .from('agent_kya_registry')
      .select('*')
      .eq('agent_name', agentName)
      .single();
    // PostgREST reports "no rows" as an error too, so absence and failure have
    // to be told apart by code rather than by the presence of `error`.
    if (error && error.code !== 'PGRST116') {
      return { profile: null, unreadable: `the KYA registry could not be read: ${error.message}` };
    }
    if (!data) return { profile: null, unreadable: null };
    return { profile: this.toProfile(data), unreadable: null };
  }

  async getAgentProfile(agentName: string): Promise<AgentKYAProfile | null> {
    return (await this.lookupAgent(agentName)).profile;
  }

  private toProfile(data: Record<string, any>): AgentKYAProfile {
    const _unused = data;
    return {
      agentName:            data.agent_name,
      repidScore:           data.repid_score,
      repidTier:            data.repid_tier,
      spendingLimitDaily:   data.spending_limit_daily,
      spendingLimitPerTx:   data.spending_limit_per_tx,
      insuranceCoverage:    data.insurance_coverage,
      collateralStaked:     data.collateral_staked,
      // NO FABRICATED FALLBACK. This was
      // `data.zkp_proof_cid || \`ZKP_STUB_${agentName}_VERIFIED\``, which turned
      // a missing proof into a non-empty, truthy string containing the word
      // VERIFIED — so every consumer testing for presence saw a proof that does
      // not exist. An absent proof is the empty string, and
      // `isPlaceholderProofCid` is how a caller asks.
      zkpProofCID:          data.zkp_proof_cid ?? '',
      humanCustodyVerified: data.human_custody_verified,
      vaultAccessPermitted: data.vault_access_permitted,
    };
  }

  /**
   * Spend in the last 24h, or NULL when the history could not be read.
   *
   * The original discarded the query error and returned `(data || []).reduce(…)`,
   * so a database failure produced 0 — indistinguishable from "has spent
   * nothing" — and the daily-limit check then PASSED. A DB outage granted the
   * full daily allowance, silently, on the payment path.
   *
   * Absent is not zero. The nullable return is what forces the caller to have
   * an opinion about a limit it could not evaluate.
   */
  async getDailySpend(agentName: string): Promise<number | null> {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { data, error } = await this.supabase
      .from('kya_compliance_receipts')
      .select('payment_amount_usdc')
      .eq('agent_name', agentName)
      .eq('bft_passed', true)
      .gte('created_at', since);
    if (error || !data) return null;
    let total = 0;
    for (const row of data) {
      const amount = Number(row.payment_amount_usdc);
      // A row whose amount will not parse makes the TOTAL unknown, not smaller.
      if (!Number.isFinite(amount)) return null;
      total += amount;
    }
    return total;
  }

  /**
   * Decide whether this payment may proceed.
   *
   * EVERY DENIAL PATH STATES ONLY WHAT IT CHECKED. The original asserted
   * `withinDailyLimit: true` inside the per-transaction denial — a branch that
   * returns before the spend history is ever read. That field went into a
   * compliance receipt as a fact about a limit nobody had evaluated, which is
   * the house defect in the one artifact whose whole purpose is being evidence.
   * Unevaluated limits are now `null`.
   */
  async validate(
    agentName: string,
    amountUSDC: number
  ): Promise<KYAComplianceResult> {
    const { profile, unreadable } = await this.lookupAgent(agentName);

    if (!profile) {
      return {
        agentName,
        kya_verified:      false,
        repidScore:        0,
        repidTier:         'Bronze',
        humanCustodyBound: false,
        zkpProofCID:       '',
        withinDailyLimit:  null,
        withinTxLimit:     null,
        insuranceCoverage: 0,
        // Denies either way, but says which is true. A registry that could not
        // be read has not told us the agent is absent.
        denialReason:      unreadable
          ? `${unreadable} — this is NOT CHECKED, not a finding that ${agentName} is unregistered`
          : `Agent ${agentName} not found in KYA registry`,
      };
    }

    const txCheck = checkPerTxLimit(amountUSDC, profile.spendingLimitPerTx);
    if (txCheck.outcome !== 'VERIFIED') {
      return {
        agentName,
        kya_verified:      false,
        repidScore:        profile.repidScore,
        repidTier:         profile.repidTier,
        humanCustodyBound: profile.humanCustodyVerified,
        zkpProofCID:       profile.zkpProofCID,
        // NOT `true`. This branch never read the spend history.
        withinDailyLimit:  null,
        withinTxLimit:     txCheck.withinLimit,
        insuranceCoverage: profile.insuranceCoverage,
        denialReason:      `${txCheck.detail} (${profile.repidTier} tier)`,
      };
    }

    const dailyCheck = checkDailyLimit(
      amountUSDC,
      await this.getDailySpend(agentName),
      profile.spendingLimitDaily
    );
    if (dailyCheck.outcome !== 'VERIFIED') {
      return {
        agentName,
        kya_verified:      false,
        repidScore:        profile.repidScore,
        repidTier:         profile.repidTier,
        humanCustodyBound: profile.humanCustodyVerified,
        zkpProofCID:       profile.zkpProofCID,
        withinDailyLimit:  dailyCheck.withinLimit,
        withinTxLimit:     true,
        insuranceCoverage: profile.insuranceCoverage,
        denialReason:      dailyCheck.detail,
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
    // A reputation update for an agent we cannot resolve is DROPPED, and it
    // used to be dropped in silence — including when the cause was an
    // unreadable registry rather than an unknown agent. Throwing lets the
    // caller decide; returning quietly decided for it.
    const { profile, unreadable } = await this.lookupAgent(agentName);
    if (unreadable) {
      throw new Error(`refusing to update RepID for ${agentName}: ${unreadable}`);
    }
    if (!profile) return;

    // ONE tier ladder. This used `>` while RepIDConfig used `>=` over the same
    // thresholds, so at exactly 2500, 5000 and 7500 the two disagreed about the
    // tier — and the tier decides the spending limits.
    const newScore = Math.max(REPID_MIN, Math.min(REPID_MAX, profile.repidScore + delta));
    const newTier = tierForScore(newScore);
    const { daily: newDailyLimit, perTx: newTxLimit } = TIER_LIMITS[newTier];

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
