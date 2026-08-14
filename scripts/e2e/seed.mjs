#!/usr/bin/env node
//
// seed.mjs — the fixture the E2E run executes against.
//
// Three agents, chosen so the run can tell measured evidence from absent
// evidence. That distinction is the whole point: before Sprint 2 every agent
// scored an identical 3971 from four literals, so a suite that only asserted
// "a score came back" would have passed against the bug.
//
//   TORCH  — rich, recent evidence on all four signals. Should score high and
//            report fullyMeasured.
//   QUIET  — registered in repid_agents, zero observations, no human custody.
//            Should score EXACTLY 0, with all four signals `unmeasured`.
//   ORPHAN — in the KYA registry but absent from repid_agents, which is the real
//            namespace split recorded in SESSION_SUMMARY.md (TORCH vs
//            trinity-torch). Should resolve to null and still not fabricate.
//
// Observation timestamps are generated relative to run time so decay behaves the
// same on every run; the fixture cannot rot into "all evidence is 400 days old".

const DAY = 86_400_000;
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const daysAgo = (d) => iso(d * DAY);

function rateObservations(agentId, signal, { total, successes, spreadDays }) {
  const rows = [];
  for (let i = 0; i < total; i++) {
    rows.push({
      agent_id: agentId,
      signal,
      observed_at: daysAgo((i / Math.max(1, total - 1)) * spreadDays),
      success: i < successes,
      domain: 'payments',
      value_ms: null,
    });
  }
  return rows;
}

function latencyObservations(agentId, { total, ms, spreadDays }) {
  const rows = [];
  for (let i = 0; i < total; i++) {
    rows.push({
      agent_id: agentId,
      signal: 'latency',
      observed_at: daysAgo((i / Math.max(1, total - 1)) * spreadDays),
      success: true,
      domain: 'payments',
      value_ms: ms,
    });
  }
  return rows;
}

export const AGENTS = {
  torch: { id: '11111111-1111-4111-8111-111111111111', ledgerName: 'trinity-torch', payName: 'TORCH' },
  quiet: { id: '22222222-2222-4222-8222-222222222222', ledgerName: 'trinity-quiet', payName: 'QUIET' },
  orphan: { payName: 'ORPHAN' },
};

export function buildSeed() {
  const observations = [
    ...rateObservations(AGENTS.torch.id, 'bft', { total: 24, successes: 22, spreadDays: 20 }),
    ...rateObservations(AGENTS.torch.id, 'integrity', { total: 40, successes: 37, spreadDays: 25 }),
    ...rateObservations(AGENTS.torch.id, 'x402', { total: 50, successes: 48, spreadDays: 15 }),
    ...latencyObservations(AGENTS.torch.id, { total: 30, ms: 180, spreadDays: 20 }),
  ];

  return {
    tables: {
      repid_agents: [
        { id: AGENTS.torch.id, agent_name: AGENTS.torch.ledgerName },
        { id: AGENTS.quiet.id, agent_name: AGENTS.quiet.ledgerName },
      ],

      // QUIET deliberately contributes no rows here.
      v_agent_earned_observations: observations,

      agent_kya_registry: [
        {
          agent_name: 'TORCH',
          repid_score: 6000,
          repid_tier: 'Gold',
          spending_limit_daily: 100000,
          spending_limit_per_tx: 50000,
          insurance_coverage: 1000000,
          collateral_staked: 50000,
          zkp_proof_cid: null,
          human_custody_verified: true,
          vault_access_permitted: true,
        },
        {
          agent_name: 'QUIET',
          repid_score: 3971,
          repid_tier: 'Silver',
          spending_limit_daily: 100000,
          spending_limit_per_tx: 50000,
          insurance_coverage: 250000,
          collateral_staked: 10000,
          zkp_proof_cid: null,
          // No human custody: with zero measured signals this must score 0, not
          // the 0.05 custody floor. It is the cleanest possible statement that
          // an unmeasured metric is not a defaulted one.
          human_custody_verified: false,
          vault_access_permitted: true,
        },
        {
          agent_name: 'ORPHAN',
          repid_score: 3971,
          repid_tier: 'Silver',
          spending_limit_daily: 100000,
          spending_limit_per_tx: 50000,
          insurance_coverage: 250000,
          collateral_staked: 10000,
          zkp_proof_cid: null,
          human_custody_verified: false,
          vault_access_permitted: true,
        },
        {
          // Exists so the dual-signature gate is actually REACHED. With only
          // TORCH (per-tx 50000) a 60000 payment is denied at KYA validation
          // first, so the signature assertions passed without the gate ever
          // running. A limit above the 50000 single-signature threshold is what
          // makes that test test something.
          agent_name: 'WHALE',
          repid_score: 8000,
          repid_tier: 'Platinum',
          spending_limit_daily: 1000000,
          spending_limit_per_tx: 200000,
          insurance_coverage: 5000000,
          collateral_staked: 100000,
          zkp_proof_cid: null,
          human_custody_verified: true,
          vault_access_permitted: true,
        },
        {
          agent_name: 'TIGHT',
          repid_score: 3000,
          repid_tier: 'Silver',
          spending_limit_daily: 10000,
          spending_limit_per_tx: 100,
          insurance_coverage: 50000,
          collateral_staked: 1000,
          zkp_proof_cid: null,
          human_custody_verified: true,
          vault_access_permitted: true,
        },
      ],

      // Present but empty: the routes read these, and an unseeded table is a
      // hard 404 by design (see postgrest-stub.mjs header).
      kya_compliance_receipts: [],
      trinity_agent_logs: [],
      bft_payment_evaluations: [],
      institution_risk_config: [],
    },
    primaryKeys: {
      agent_kya_registry: 'agent_name',
      institution_risk_config: 'institution_id',
    },
    rpc: {},
  };
}
