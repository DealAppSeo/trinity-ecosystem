// lib/trustshell/EarnedMetricsRepo.ts
//
// Fetches the observation rows that EarnedMetrics scores.
//
// The split is deliberate: EarnedMetrics is pure and portable, this file is the
// only part that knows about Postgres. Decay and shrinkage are NOT reimplemented
// in SQL — a second implementation would drift from the one covered by
// scripts/check-earned-metrics.mjs, and the drift would be invisible.

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  measureRate,
  unmeasured,
  describeEvidence,
  type EarnedMetricSet,
  type EvidenceReport,
  type Observation,
} from './EarnedMetrics';

/**
 * How far back to pull observations. Four half-lives, past which a row's decay
 * weight is under 1/16 and it cannot move a score meaningfully.
 */
export const OBSERVATION_WINDOW_DAYS = 120;

/**
 * Hard row cap, newest first. Two of the twelve production agents carry >30,000
 * observations, and a payment request must not pull those synchronously. Because
 * rows are ordered newest-first and older rows decay toward zero, truncation
 * costs precision on evidence that was already nearly weightless.
 */
export const MAX_OBSERVATIONS = 3000;

export interface EarnedMetricsLoad {
  /** The name as the caller supplied it. */
  requestedAgent: string;
  /** The `repid_agents.agent_name` it resolved to, or null. */
  resolvedAgent: string | null;
  agentId: string | null;
  metrics: EarnedMetricSet;
  evidence: EvidenceReport;
  /** True when the row cap was hit, so a reader knows the tail was dropped. */
  truncated: boolean;
}

export class EarnedMetricsRepository {
  private get supabase() {
    return getSupabaseAdmin();
  }

  /**
   * Resolve a payment-path agent name to a reputation-ledger agent id.
   *
   * These are two different namespaces: `agent_kya_registry` holds `TORCH`,
   * `repid_agents` holds `trinity-torch`, and a direct join between them matches
   * nothing. All 12 registered agents resolve through the `trinity-` prefix.
   * Exact match is tried first so non-Trinity agents still work.
   */
  async resolveAgent(agentName: string): Promise<{ id: string; name: string } | null> {
    const candidates = [agentName, `trinity-${agentName.toLowerCase()}`];
    for (const candidate of candidates) {
      const { data } = await this.supabase
        .from('repid_agents')
        .select('id, agent_name')
        .eq('agent_name', candidate)
        .maybeSingle();
      if (data?.id) return { id: data.id, name: data.agent_name };
    }
    return null;
  }

  async load(agentName: string, opts: { now?: string; domain?: string } = {}): Promise<EarnedMetricsLoad> {
    const now = opts.now ?? new Date().toISOString();
    const resolved = await this.resolveAgent(agentName);

    const noSuchAgent = (): EarnedMetricSet => ({
      bftAccuracy: unmeasured(BFT_ABSENT),
      veritasCatchRate: unmeasured(`no agent in repid_agents matches "${agentName}"`),
      x402SuccessRate: unmeasured(`no agent in repid_agents matches "${agentName}"`),
      latencyMs: unmeasured(LATENCY_ABSENT),
    });

    if (!resolved) {
      const metrics = noSuchAgent();
      return {
        requestedAgent: agentName,
        resolvedAgent: null,
        agentId: null,
        metrics,
        evidence: describeEvidence(metrics),
        truncated: false,
      };
    }

    const since = new Date(Date.parse(now) - OBSERVATION_WINDOW_DAYS * 86_400_000).toISOString();

    const { data, error } = await this.supabase
      .from('v_agent_earned_observations')
      .select('signal, observed_at, success, domain')
      .eq('agent_id', resolved.id)
      .gte('observed_at', since)
      .order('observed_at', { ascending: false })
      .limit(MAX_OBSERVATIONS);

    if (error) {
      // A failed read is not an absence of evidence. Reporting it as `unmeasured`
      // with the database's own message keeps a transport fault from silently
      // becoming "this agent has no track record".
      const metrics: EarnedMetricSet = {
        bftAccuracy: unmeasured(BFT_ABSENT),
        veritasCatchRate: unmeasured(`observation read failed: ${error.message}`),
        x402SuccessRate: unmeasured(`observation read failed: ${error.message}`),
        latencyMs: unmeasured(LATENCY_ABSENT),
      };
      return {
        requestedAgent: agentName,
        resolvedAgent: resolved.name,
        agentId: resolved.id,
        metrics,
        evidence: describeEvidence(metrics),
        truncated: false,
      };
    }

    const rows = data ?? [];
    const bySignal = (signal: string): Observation[] =>
      rows
        .filter((r) => r.signal === signal)
        .map((r) => ({
          observedAt: r.observed_at as string,
          success: r.success === true,
          domain: (r.domain as string | null) ?? null,
        }));

    const metrics: EarnedMetricSet = {
      // No table records BFT outcomes per agent, so this is structurally
      // unmeasurable rather than merely missing for this agent. It carries the
      // heaviest default weight (0.40), which is exactly why it must not be
      // quietly filled in.
      bftAccuracy: unmeasured(BFT_ABSENT),

      // `hallucination_caught` is recorded per scored event. Success here is the
      // ABSENCE of a caught hallucination, i.e. a clean-output rate. That is what
      // the data supports; it is not literally a "catch rate", and the field name
      // it feeds is inherited from RepIDConfig rather than chosen here.
      veritasCatchRate: measureRate(bySignal('integrity'), { now, domain: opts.domain }),

      x402SuccessRate: measureRate(bySignal('x402'), { now }),

      latencyMs: unmeasured(LATENCY_ABSENT),
    };

    return {
      requestedAgent: agentName,
      resolvedAgent: resolved.name,
      agentId: resolved.id,
      metrics,
      evidence: describeEvidence(metrics),
      truncated: rows.length >= MAX_OBSERVATIONS,
    };
  }
}

const BFT_ABSENT =
  'no BFT outcomes are recorded anywhere: trinity_receipt_bft_results and ' +
  'bft_payment_evaluations both hold zero rows, so this is an unbuilt subsystem, ' +
  'not a quiet agent. Scores zero rather than being assumed.';

const LATENCY_ABSENT =
  'no table records latency per agent: hal_classifications has 147k latency ' +
  'samples but no agent_id, and repid_score_events has no latency column. ' +
  'Scores as the worst point on the curve rather than being assumed.';
