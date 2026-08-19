// lib/trustshell/CollateralRepository.ts
//
// Reads real collateral for an agent, and refuses to guess when it cannot.
//
// A stateful ADAPTER — the tenth. The decision logic is in `collateral.ts` with
// zero imports; this does one query and hands the rows over.
//
// LAZY CLIENT, per lib/CLAUDE.md: `getSupabaseAdmin()` is called inside the
// method, never at module scope and never in a field initialiser.
//
// ── THE BLOCKER THIS ADAPTER EXISTS TO REPORT ───────────────────────────────
//
// **There is no join key from an agent to its deposits.** Measured 2026-08-19:
//
//   `agent_kya_registry` columns: id, agent_name, agent_id_onchain, repid_score,
//   repid_tier, collateral_staked, zkp_proof_cid, last_repid_update,
//   dbt_token_id, sbt_token_id, zkp_sbt_proof_cid
//
//   `stake_deposits` keys on `builder_id` (uuid).
//
// Nothing connects them. `agent_kya_registry.id` is not `stake_deposits.builder_id`
// — the 49 builder_ids there do not appear in the registry at all.
//
// ── AND THE COLUMN THAT LOOKS LIKE THE ANSWER IS A LITERAL ──────────────────
//
// `agent_kya_registry.collateral_staked` is populated for all 12 agents with
// **exactly 50.000000** — ONE distinct value across every row. It sums to 600
// USDC against the 50 USDC that actually exists in `stake_deposits`
// (`is_simulated = false`, `status = 'active'`), a **12x overstatement**.
//
// A constant cannot move with behaviour, which is the same defect the four
// fabricated RepID inputs had before `EarnedMetrics` replaced them — bftAccuracy
// 94, veritasCatchRate 97, x402SuccessRate 100, latencyMs 180, all literals on
// the live payment path. Reading `collateral_staked` as `S_usd` would put a
// fabricated number straight into `100 * sqrt(S_usd)`, which is a spending
// ceiling.
//
// So this adapter does NOT read that column. Until a join key exists, per-agent
// collateral is **NOT_CHECKED**, and `effectiveAuthority` refuses rather than
// spending against a number nobody earned.

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { realCollateralUsd, type RealCollateral, type StakeDeposit } from './collateral';

export class CollateralRepository {
  /** A getter, never a field — see the header. */
  private get supabase() {
    return getSupabaseAdmin();
  }

  /**
   * Real, active collateral for one builder.
   *
   * Takes a `builderId` rather than an agent name BECAUSE THE MAPPING DOES NOT
   * EXIST. Making the signature honest is the point: a caller holding only an
   * agent name cannot reach this, and will not be tempted to pass something that
   * looks close enough.
   */
  async forBuilder(builderId: string): Promise<RealCollateral> {
    try {
      const { data, error } = await this.supabase
        .from('stake_deposits')
        .select('builder_id, amount, asset, is_simulated, status, tx_hash, deposit_tx_hash')
        .eq('builder_id', builderId);

      if (error) {
        return {
          usd: null,
          outcome: 'NOT_CHECKED',
          countedRows: 0,
          excluded: { simulated: 0, notActive: 0, wrongAsset: 0, unparseable: 0 },
          detail: `stake_deposits unreadable: ${error.message}`,
        };
      }
      return realCollateralUsd((data ?? []) as StakeDeposit[]);
    } catch (e: any) {
      return {
        usd: null,
        outcome: 'NOT_CHECKED',
        countedRows: 0,
        excluded: { simulated: 0, notActive: 0, wrongAsset: 0, unparseable: 0 },
        detail: `stake_deposits unreachable: ${e?.message ?? String(e)}`,
      };
    }
  }

  /**
   * Collateral for an AGENT — permanently NOT_CHECKED, with the reason.
   *
   * This method exists so the payment path can ask the honest question and get
   * the honest answer, rather than every call site inventing its own workaround.
   * It does not query: there is nothing to query with.
   *
   * When a join key lands, this becomes a real lookup and the payment path
   * changes in one place. Until then it names the blocker on every request,
   * which is how the gap stays visible instead of being quietly papered over
   * with `collateral_staked`.
   */
  async forAgent(agentName: string): Promise<RealCollateral> {
    return {
      usd: null,
      outcome: 'NOT_CHECKED',
      countedRows: 0,
      excluded: { simulated: 0, notActive: 0, wrongAsset: 0, unparseable: 0 },
      detail:
        `no join key from agent "${agentName}" to stake_deposits.builder_id. ` +
        'agent_kya_registry.collateral_staked is NOT that key: it is 50.000000 for all 12 ' +
        'agents — one distinct value, summing to 600 USDC against the 50 USDC that exists — ' +
        'so reading it would put a literal into a spending ceiling.',
    };
  }
}
