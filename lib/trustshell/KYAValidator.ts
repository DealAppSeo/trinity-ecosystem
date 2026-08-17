// lib/trustshell/KYAValidator.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { AgentKYAProfile, KYAComplianceResult } from './types';
import {
  checkDailyLimit,
  checkPerTxLimit,
  REPID_MIN,
  REPID_MAX,
} from './repid-scoring';

export class KYAValidator {
  /** Optional injected client for tests. Still lazy — see lib/CLAUDE.md. */
  constructor(private readonly injectedClient?: ReturnType<typeof getSupabaseAdmin>) {}

  private get supabase() { return this.injectedClient ?? getSupabaseAdmin(); }

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
   * FAILS CLOSED, and this is the one on the list that had teeth. It used to
   * destructure only `data`, so an RLS denial or a transport fault returned
   * `(null || []).reduce(...)` === **0 spent today** — and the caller is
   * `validate()`, which compares that against `spendingLimitDaily`. A
   * permissions failure read as "this agent has spent nothing", the single most
   * permissive answer the function can give, on the path that authorizes
   * payments. `getAgentProfile` directly above already captured `error`; this
   * was the same file disagreeing with itself.
   *
   * ── WHY NULL RATHER THAN A THROW ───────────────────────────────────────────
   *
   * BOTH LANES FOUND THIS AND FIXED IT DIFFERENTLY. #52 on main threw; this
   * branch returns `number | null`. The merge keeps NULL, for two reasons that
   * are about evidence rather than taste:
   *
   * 1. A throw records nothing. This value flows into `checkDailyLimit` and
   *    then into a compliance receipt's `withinDailyLimit`, which is `boolean |
   *    null` precisely so the receipt can carry "this limit was NOT evaluated"
   *    as a fact about the decision. An exception 500s the request and leaves
   *    no artifact saying which check did not run.
   * 2. A throw does not survive the next `try/catch`. A gate that throws tends
   *    to acquire a handler returning the permissive answer, which is how this
   *    class of bug comes back. A nullable return is enforced by the compiler
   *    at every call site instead.
   *
   * The throw's reasoning is kept above because it is right about the danger,
   * and the message it carried is preserved in `checkDailyLimit`'s NOT_CHECKED
   * detail. Absent is not zero, either way.
   *
   * ── AND A HOLE THE THROW DID NOT CLOSE ─────────────────────────────────────
   *
   * `(data || []).reduce((s, r) => s + Number(r.payment_amount_usdc), 0)` yields
   * **NaN** for a single unparseable amount, and `NaN > limit` is `false` — so a
   * row that will not parse passes the limit rather than failing it. Capturing
   * the query error does not touch that path. A row whose amount cannot be read
   * makes the TOTAL unknown, not smaller, so it returns null here too.
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
      // `reduce` would fold it to NaN, and `NaN > limit` is false — so the
      // unparseable row would have PASSED the limit it broke.
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
        // No profile, so no ceiling was applied. NOT 0 — that is a real policy.
        enforcedPerTxLimit: null,
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
        enforcedPerTxLimit: profile.spendingLimitPerTx,
        insuranceCoverage: profile.insuranceCoverage,
        denialReason:      `${txCheck.detail} for ${profile.repidTier} tier`,
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
        enforcedPerTxLimit: profile.spendingLimitPerTx,
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
      enforcedPerTxLimit: profile.spendingLimitPerTx,
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

    // ── TRUST THE ROW: this updates the SCORE and nothing else ───────────────
    //
    // It used to rewrite `repid_tier`, `spending_limit_daily` and
    // `spending_limit_per_tx` from `TIER_LIMITS[tierForScore(newScore)]`. That
    // made an agent's authorized ceiling depend on WHICH WRITER LAST TOUCHED ITS
    // ROW rather than on anything it did: measured 2026-08-17, one compliant
    // payment moved TORCH from 10,000 to 500,000 USDC daily (x50), and because
    // `delta` is signed, a PENALTY did the same — TORCH had 5,100 points of
    // headroom, more than two full tiers. Full measurement:
    // `docs/REPID-REGISTRY-DRIFT-2026-08-17.md`.
    //
    // Sean's call, 2026-08-17: **the stored limits are the authoritative
    // ceiling.** The ladder is a derivation aid and a briefing aid, not the
    // enforcement source. So the three ceiling columns move only by operator
    // action, and this method stops touching them.
    //
    // ── WHY `repid_tier` IS LEFT ALONE TOO, WHICH IS THE SUBTLE PART ─────────
    //
    // Dropping the two limit writes while still writing the tier from the ladder
    // looks conservative and is worse: #82 measured that every stored
    // `repid_tier` matches its stored `spending_limit_daily` under `TIER_LIMITS`
    // — the rows are internally consistent, written by an older ladder whose
    // floors differ. Rewriting the label alone would break that pairing and
    // leave a row whose tier names a ceiling it does not carry, which is the
    // same reviewer-vs-enforcer split one level down.
    //
    // The tier stored beside a ceiling LABELS THAT CEILING. It is not a
    // redundant copy of `tierForScore(repid_score)` and must not be reconciled
    // into one — that reconciliation is the trust-the-LADDER option, which was
    // considered and rejected.
    const newScore = Math.max(REPID_MIN, Math.min(REPID_MAX, profile.repidScore + delta));

    await this.supabase
      .from('agent_kya_registry')
      .update({
        repid_score:           newScore,
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
