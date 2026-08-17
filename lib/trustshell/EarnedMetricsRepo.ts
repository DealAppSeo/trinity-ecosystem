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
  measureLatencyMs,
  unmeasured,
  describeEvidence,
  type EarnedMetricSet,
  type EvidenceReport,
  type MeasuredMetric,
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

/**
 * What resolving an agent name can honestly conclude.
 *
 * `unreadable` exists so a permissions or transport failure cannot be spelled
 * the same way as a genuinely unregistered agent. The union is discriminated
 * so the compiler, not a reviewer, is what forces the caller to handle it.
 */
export type AgentResolution =
  | { status: 'found'; id: string; name: string }
  | { status: 'absent' }
  | { status: 'unreadable'; detail: string };

export class EarnedMetricsRepository {
  /**
   * Optional injected client, for tests that need to drive the failure paths.
   *
   * Still LAZY — the fallback is evaluated per access, never at construction,
   * so this keeps the module-scope rule in lib/CLAUDE.md. Nothing constructs a
   * client here.
   */
  constructor(private readonly injectedClient?: ReturnType<typeof getSupabaseAdmin>) {}

  private get supabase() {
    return this.injectedClient ?? getSupabaseAdmin();
  }

  /**
   * Resolve a payment-path agent name to a reputation-ledger agent id.
   *
   * These are two different namespaces: `agent_kya_registry` holds `TORCH`,
   * `repid_agents` holds `trinity-torch`, and a direct join between them matches
   * nothing. All 12 registered agents resolve through the `trinity-` prefix.
   * Exact match is tried first so non-Trinity agents still work.
   */
  /**
   * THREE OUTCOMES, because two collapse "we could not look" into "there is
   * nothing there".
   *
   * This method used to destructure only `data`. An RLS denial, an expired key
   * or a transport fault all produced `data === null`, which fell through both
   * candidates and returned "no such agent" — and `load()` then reported the
   * agent as having no track record. That is a *plausible wrong answer* about
   * an agent's reputation produced by a permissions failure, which is the exact
   * shape `load()` twelve lines below already refuses for its own read:
   * "a failed read is not an absence of evidence".
   */
  async resolveAgent(agentName: string): Promise<AgentResolution> {
    const candidates = [agentName, `trinity-${agentName.toLowerCase()}`];
    for (const candidate of candidates) {
      const { data, error } = await this.supabase
        .from('repid_agents')
        .select('id, agent_name')
        .eq('agent_name', candidate)
        .maybeSingle();

      // Loud, and it stops here: trying the next candidate after a failed read
      // would turn one unreadable table into "no match", which is the bug.
      if (error) {
        return {
          status: 'unreadable',
          detail: `could not read repid_agents for "${candidate}": ${error.message}`,
        };
      }
      if (data?.id) return { status: 'found', id: data.id, name: data.agent_name };
    }
    return { status: 'absent' };
  }

  async load(agentName: string, opts: { now?: string; domain?: string } = {}): Promise<EarnedMetricsLoad> {
    const now = opts.now ?? new Date().toISOString();
    const resolved = await this.resolveAgent(agentName);

    const noSuchAgent = (): EarnedMetricSet => ({
      bftAccuracy: unmeasured(`no agent in repid_agents matches "${agentName}" — ${BFT_SPARSE}`),
      veritasCatchRate: unmeasured(`no agent in repid_agents matches "${agentName}"`),
      x402SuccessRate: unmeasured(`no agent in repid_agents matches "${agentName}"`),
      latencyMs: unmeasured(`no agent in repid_agents matches "${agentName}" — ${LATENCY_SPARSE}`),
    });

    // An unreadable registry is NOT_CHECKED, not "no track record". Same
    // reasoning as the observations read below, and it must carry the
    // database's own message or the operator cannot tell an RLS denial from a
    // genuinely unregistered agent.
    if (resolved.status === 'unreadable') {
      const unreadable = (): EarnedMetricSet => ({
        bftAccuracy: unmeasured(resolved.detail),
        veritasCatchRate: unmeasured(resolved.detail),
        x402SuccessRate: unmeasured(resolved.detail),
        latencyMs: unmeasured(resolved.detail),
      });
      const metrics = unreadable();
      return {
        requestedAgent: agentName,
        resolvedAgent: null,
        agentId: null,
        metrics,
        evidence: describeEvidence(metrics),
        truncated: false,
      };
    }

    if (resolved.status === 'absent') {
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

    // `quorum_providers_used` was added 2026-08-17 (Gate 2, PR #94) so this
    // query can see the provenance repid_score_events.metadata already carried.
    // Selecting it here does not yet change scoring — nothing downstream reads
    // it. It is the "repo half" check:verdict-provenance requires; see
    // lib/trustshell/verdict-provenance.ts for what wiring it into
    // `refusesToIssue` still needs, and why that is a separate, larger change.
    const { data, error } = await this.supabase
      .from('v_agent_earned_observations')
      .select('signal, observed_at, success, domain, value_ms, quorum_providers_used')
      .eq('agent_id', resolved.id)
      .gte('observed_at', since)
      .order('observed_at', { ascending: false })
      .limit(MAX_OBSERVATIONS);

    if (error) {
      // A failed read is not an absence of evidence. Reporting it as `unmeasured`
      // with the database's own message keeps a transport fault from silently
      // becoming "this agent has no track record".
      const metrics: EarnedMetricSet = {
        bftAccuracy: unmeasured(`observation read failed: ${error.message}`),
        veritasCatchRate: unmeasured(`observation read failed: ${error.message}`),
        x402SuccessRate: unmeasured(`observation read failed: ${error.message}`),
        latencyMs: unmeasured(`observation read failed: ${error.message}`),
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

    const latencySamples = rows
      .filter((r) => r.signal === 'latency' && r.value_ms !== null)
      .map((r) => ({ observedAt: r.observed_at as string, latencyMs: Number(r.value_ms) }));

    const metrics: EarnedMetricSet = {
      // Consensus verdicts from bft_payment_evaluations, counted only once the
      // worker has actually evaluated them. This carries the heaviest default
      // weight (0.40) and is the sparsest signal in the system, so it will
      // usually report `insufficient` — which is the honest reading, and very
      // different from the 94 that used to be asserted here.
      bftAccuracy: explain(measureRate(bySignal('bft'), { now }), BFT_SPARSE),

      // `hallucination_caught` is recorded per scored event. Success here is the
      // ABSENCE of a caught hallucination, i.e. a clean-output rate. That is what
      // the data supports; it is not literally a "catch rate", and the field name
      // it feeds is inherited from RepIDConfig rather than chosen here.
      veritasCatchRate: measureRate(bySignal('integrity'), { now, domain: opts.domain }),

      x402SuccessRate: measureRate(bySignal('x402'), { now }),

      latencyMs: explain(measureLatencyMs(latencySamples, { now }), LATENCY_SPARSE),
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

/**
 * Attach the systemic reason a signal is thin.
 *
 * "This agent has no BFT verdicts" and "almost nothing in this system produces
 * BFT verdicts" read identically at the call site, and only the second tells you
 * where to go and fix it. The per-agent reason stays first; the systemic note is
 * appended so neither is lost.
 */
function explain(metric: MeasuredMetric, systemic: string): MeasuredMetric {
  if (metric.state === 'measured') return metric;
  return { ...metric, reason: `${metric.reason} — ${systemic}` };
}

const BFT_SPARSE =
  'BFT verdicts only exist for payments that the bft/process worker has ' +
  'evaluated, and bft_payment_evaluations currently holds zero evaluated rows ' +
  'because the payment path has run ~12 times ever. The plumbing is complete ' +
  '(pay enqueues, bft/process drains and writes the verdict back); what is ' +
  'missing is volume. Scores zero until then rather than being assumed.';

const LATENCY_SPARSE =
  'latency is attributed per agent only via llm_call_log.agent_id, which is set ' +
  'on 209 of 486,280 rows (0.04%). The remaining calls are logged without an ' +
  'agent, and repid_score_events.llm_call_id does not recover them: 147,617 ' +
  'events carry one and only 15 resolve against llm_call_log. Fixing attribution ' +
  'at the write site is what unlocks this signal, not more volume.';
