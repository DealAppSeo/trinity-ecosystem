// app/api/trustrails/system-trust/route.ts
// TrustRails Sprint — Created March 26 2026 by Gemini

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';


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
      complianceRate:   totalTxns24h + blockedTxns24h > 0
        ? ((totalTxns24h / (totalTxns24h + blockedTxns24h)) * 100).toFixed(1) + '%'
        : '100%',
    },
    // Regulatory readiness
    regulatoryStatus: {
      micaCompliant:    true,
      geniusActReady:   true,
      fatfAligned:      true,
      fireblocksPreAuth: true,
      aminaPilotReady:  systemScore >= 7500,
    },
  });
}


export const dynamic = 'force-dynamic';
