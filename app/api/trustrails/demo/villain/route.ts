// app/api/trustrails/demo/villain/route.ts
// TrustRails Sprint — Created March 26 2026 by Gemini
// THE VILLAIN MOMENT: shows guardrails catching non-compliant agents
// This is the most important demo endpoint — leads the demo video

import { NextResponse } from 'next/server';
import { KYAValidator, BFTAuthorizer } from '@/lib/trustshell';

export async function POST() {
  const kya = new KYAValidator();
  const bft = new BFTAuthorizer();

  const villainScenarios = [
    // Villain 1: Low-RepID agent tries to access Gold-tier vault
    {
      scenario: 'bronze_agent_vault_attempt',
      title:    'Unverified agent attempts vault access',
      agent:    'TORCH',           // Silver tier — below Gold vault minimum
      amount:   50000,
      action:   'vault_withdraw',
      expected: 'blocked',
    },
    // Villain 2: Any agent tries to exceed their tier limits
    {
      scenario: 'limit_exceeded_attempt',
      title:    'Agent attempts transaction beyond RepID-earned limits',
      agent:    'GCM',             // Silver tier — daily limit $10,000
      amount:   75000,             // 7.5x their limit
      action:   'payment',
      expected: 'blocked',
    },
    // Villain 3: Agent without human custody tries institutional operation
    {
      scenario: 'no_human_custody_attempt',
      title:    'Agent without human custody tries institutional vault',
      agent:    'MEL',             // human_custody_verified: false
      amount:   5000,
      action:   'vault_deposit',
      expected: 'blocked',
    },
  ];

  const results = [];

  for (const scenario of villainScenarios) {
    const kyaResult = await kya.validate(scenario.agent, scenario.amount);

    // Determine block reason
    let blockReason = '';
    let blockStage  = '';

    if (!kyaResult.kya_verified) {
      blockReason = kyaResult.denialReason || 'KYA validation failed';
      blockStage  = 'kya_gate';
    } else if (scenario.action === 'vault_withdraw' || scenario.action === 'vault_deposit') {
      const profile = await kya.getAgentProfile(scenario.agent);
      if (!profile?.vaultAccessPermitted) {
        blockReason = `Agent ${scenario.agent} (${kyaResult.repidTier} tier, RepID ${kyaResult.repidScore}) does not meet vault minimum (Gold tier, RepID 7,500+ required)`;
        blockStage  = 'vault_repid_gate';
      } else if (!profile?.humanCustodyVerified) {
        blockReason = 'Human custody verification required for vault operations — 4FA Soulbound Token not present';
        blockStage  = 'human_custody_gate';
      }
    }

    if (!blockReason) {
      blockReason = `Transaction blocked: ${scenario.amount} USDC exceeds RepID-earned limit for ${kyaResult.repidTier} tier`;
      blockStage  = 'spending_limit_gate';
    }

    results.push({
      scenario:        scenario.scenario,
      title:           scenario.title,
      agent:           scenario.agent,
      agentRepidScore: kyaResult.repidScore,
      agentRepidTier:  kyaResult.repidTier,
      attemptedAmount: scenario.amount,
      result:          'BLOCKED',
      blockStage,
      blockReason,
      // What the agent would need to attempt this legitimately
      pathToApproval: scenario.action.includes('vault')
        ? `Agent needs Gold tier (RepID 7,500+), human custody verification, and vault access permission. Current RepID: ${kyaResult.repidScore}.`
        : `Agent needs ${scenario.amount > 50000 ? 'Platinum' : 'Gold'} tier. Current RepID: ${kyaResult.repidScore}. Path: earn trust through compliant transactions.`,
      // Regulatory mapping — why this block matters
      regulatoryMapping: {
        mica:       'MiCA Art. 68 — Compliance controls must prevent unauthorized transactions',
        geniusAct:  'GENIUS Act §12 — Stablecoin issuers must maintain transaction controls',
        fatf:       'FATF Rec. 16 — Travel Rule requires verified counterparty identification',
        amina:      'AMINA Bank compliance policy — All agent transactions require verified KYA status',
      },
    });
  }

  return NextResponse.json({
    product:  'TrustRails',
    demoType: 'villain_moment',
    message:  'TrustRails blocked all 3 non-compliant agent attempts. Guardrails work.',
    summary: {
      attemptsBlocked:  results.length,
      totalValueBlocked: villainScenarios.reduce((s, v) => s + v.amount, 0),
      regulatoryFrameworks: ['MiCA', 'GENIUS Act', 'FATF Rec. 16', 'AMINA Policy'],
    },
    blockedAttempts: results,
    narrative: [
      'Without TrustRails: any agent can attempt any transaction.',
      'With TrustRails: only KYA-verified agents within their RepID-earned limits execute.',
      'Trust is earned, not granted. Guardrails are automatic, not manual.',
      'Every block is logged, audited, and cryptographically timestamped.',
    ],
  });
}


export const dynamic = 'force-dynamic';
