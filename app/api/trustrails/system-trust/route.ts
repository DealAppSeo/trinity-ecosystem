// app/api/trustrails/system-trust/route.ts
// TrustRails Sprint — Created March 26 2026 by Gemini

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  resolveAllClaims,
  allClaimsMet,
  complianceRate,
  formatRate,
} from '@/lib/trustshell/regulatory-claims';


export async function GET() {
  // Pull all 12 agent RepID scores
  const { data: agents } = await getSupabaseAdmin()
    .from('agent_kya_registry')
    .select('agent_name, repid_score, repid_tier, insurance_coverage, human_custody_verified');

  if (!agents || agents.length === 0) {
    return NextResponse.json({ systemTrustScore: 0, status: 'no_agents' });
  }

  // PLAIN MEAN. The comment here read "Weighted average — higher RepID agents
  // get more weight", which this arithmetic does not do: summing scores and
  // dividing by the count weights every agent equally. Nothing was ever
  // weighted. Corrected rather than implemented — making it a real weighted
  // average would change a published number, and the wrong comment is the
  // actual defect, since it is what the next reader would build on.
  const scoreTotal  = agents.reduce((s, a) => s + a.repid_score, 0);
  const systemScore = Math.round(scoreTotal / agents.length);

  // TIERS COME FROM THE STORED COLUMN, DELIBERATELY, AND MUST NOT BE RECOMPUTED
  // FROM THE SCORE.
  //
  // `agent_kya_registry.repid_tier` disagrees with `tierForScore(repid_score)`
  // on 9 of 12 live rows — the rows were written by an older ladder whose floors
  // differ (see `docs/REPID-REGISTRY-DRIFT-2026-08-17.md`). That looks like a
  // bug to fix here and is not one.
  //
  // Sean's call, 2026-08-17: the STORED limits are the authoritative ceiling,
  // and the stored tier is the LABEL ON THAT CEILING — #82 measured that every
  // `repid_tier` matches its own `spending_limit_daily` under `TIER_LIMITS`.
  // So this distribution describes what agents are actually authorized to spend.
  // Deriving it from the score instead would publish a tier the enforcer does
  // not use, which is the reviewer-vs-enforcer split #85 just closed on the
  // payment path, reopened on a dashboard.
  const tiers = { Platinum: 0, Gold: 0, Silver: 0, Bronze: 0 };
  agents.forEach(a => { tiers[a.repid_tier as keyof typeof tiers]++; });

  // Recent payment stats
  const since24h = new Date(Date.now() - 86_400_000).toISOString();
  const { data: receipts } = await getSupabaseAdmin()
    .from('kya_compliance_receipts')
    .select('payment_amount_usdc, bft_passed')
    .gte('created_at', since24h);

  // bft_passed is three-state: true (consensus passed), false (consensus
  // failed), null (never evaluated — the authorizer is a placeholder on the
  // payment path). `!r.bft_passed` would fold null in with false and report
  // every unevaluated receipt as a blocked transaction, which is exactly the
  // rounding-silence-up-to-a-verdict problem the rest of this branch removes.
  const rows            = receipts || [];
  const passedRows      = rows.filter(r => r.bft_passed === true);
  const totalVolume24h  = passedRows.reduce((s, r) => s + Number(r.payment_amount_usdc), 0);
  const totalTxns24h    = passedRows.length;
  const blockedTxns24h  = rows.filter(r => r.bft_passed === false).length;
  const unevaluatedTxns24h = rows.filter(r => r.bft_passed === null || r.bft_passed === undefined).length;

  // Evidence for the regulatory claims. Every field is counted from what is
  // actually in the tables — nothing is defaulted, and nothing is a literal.
  const rate = complianceRate(totalTxns24h, blockedTxns24h);
  const regulatoryClaims = resolveAllClaims({
    evaluatedConsensusCount: rows.length - unevaluatedTxns24h,
    receiptCount: rows.length,
    humanCustodyVerifiedCount: agents.filter(a => a.human_custody_verified).length,
    agentCount: agents.length,
    // `FireblocksPreAuth.generatePreAuth` builds a local object and logs it —
    // there is no network call and no credential anywhere in this repo. Stated
    // here as the observation it is, so the claim resolves to NOT MET with the
    // reason rather than being hardcoded either way.
    fireblocksIntegrationLive: false,
    // `recipient_address` is an address. FATF Rec. 16 is about identification,
    // and no column in kya_compliance_receipts records a verified counterparty.
    verifiedCounterpartyIdentity: false,
  });

  // System status
  const status =
    systemScore >= 8000 ? 'TRUSTED'    :
    systemScore >= 6000 ? 'VERIFIED'   :
    systemScore >= 4000 ? 'MONITORING' : 'RESTRICTED';

  const statusColor =
    status === 'TRUSTED'    ? '#22c55e' :  // green
    status === 'VERIFIED'   ? '#3b82f6' :  // blue
    status === 'MONITORING' ? '#f59e0b' :  // amber
    '#ef4444';                             // red

  return NextResponse.json({
    product:           'TrustRails',
    systemTrustScore:  systemScore,          // 0-10,000
    systemTrustPct:    (systemScore / 100).toFixed(1) + '%',
    status,
    statusColor,
    tagline:           status === 'TRUSTED'
      ? 'All agents KYA-verified and operating within earned limits'
      : 'System monitoring active — some agents below institutional threshold',
    // Reported separately so "not checked" is never displayed as "blocked".
    unevaluatedTxns24h,
    agentCount:        agents.length,
    tierDistribution:  tiers,
    humanCustodyVerified: agents.filter(a => a.human_custody_verified).length,
    totalInsuranceCoverage: agents.reduce((s, a) => s + Number(a.insurance_coverage), 0),
    last24Hours: {
      paymentsExecuted: totalTxns24h,
      volumeUSDC:       totalVolume24h,
      attemptsBocked:   blockedTxns24h,
      // A rate over an empty set is UNDEFINED. This fell back to '100%' when the
      // denominator was zero — and the denominator has never been anything else:
      // measured 2026-08-19, 0 receipts in 24 hours, 12 all time (newest
      // 2026-04-01), every one with bft_passed = null. This endpoint published
      // perfect compliance, from no data, for its entire existence.
      complianceRate:       formatRate(rate),
      complianceRateDetail: rate.detail,
    },
    // Regulatory readiness — DERIVED, never asserted.
    //
    // These were four hardcoded `true` literals naming real instruments (MiCA,
    // the GENIUS Act, FATF Rec. 16). Nothing computed them and nothing verified
    // them, on a public route — this repo's defining defect in the one place an
    // outside reader takes at face value.
    //
    // `resolveClaim` has no parameter that can set a status. Each claim states
    // the concrete condition that is NECESSARY for it and reports NOT CHECKED
    // when that cannot be evaluated here. Necessary is not sufficient, and none
    // of this is a compliance assessment — that is a legal judgement made by
    // people with evidence this process does not have.
    regulatoryStatus: {
      claims: regulatoryClaims,
      allMet: allClaimsMet(regulatoryClaims),
      // Derived from a plain mean of stored RepID scores. That is a score
      // threshold, not a readiness assessment, and the field name now says so.
      aminaScoreThresholdMet: systemScore >= 7500,
      disclaimer:
        'Each entry reports whether a NECESSARY condition is observable in this system. ' +
        'It is not an assessment of compliance with the named instrument.',
    },
  });
}


export const dynamic = 'force-dynamic';
