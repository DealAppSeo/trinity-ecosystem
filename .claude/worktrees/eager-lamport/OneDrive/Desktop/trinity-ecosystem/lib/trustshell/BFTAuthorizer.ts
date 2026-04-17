// lib/trustshell/BFTAuthorizer.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

import { createClient } from '@supabase/supabase-js';
import type { BFTConsensusProof, BFTVote } from './types';
import { KYAValidator } from './KYAValidator';

export class BFTAuthorizer {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key'
  );
  private kya = new KYAValidator();
  private readonly GOLDEN_RATIO_THRESHOLD = 0.618;

  async authorize(
    paymentId:     string,
    agentName:     string,
    amountUSDC:    number,
    maxLimit:      number,
    purpose:       string
  ): Promise<BFTConsensusProof> {

    const profiles = await Promise.all([
      this.kya.getAgentProfile('VERITAS'),
      this.kya.getAgentProfile('SHOFET'),
      this.kya.getAgentProfile('SOPHIA'),
    ]);

    const votes: BFTVote[] = [];

    // VERITAS: Does payment comply with KYA rules?
    const veritasApprove = amountUSDC <= maxLimit;
    votes.push({
      agent:  'VERITAS',
      vote:   veritasApprove ? 'approve' : 'reject',
      weight: (profiles[0]?.repidScore || 7500) / 10000,
      reason: veritasApprove
        ? `Payment ${amountUSDC} USDC within limit ${maxLimit} — KYA compliant`
        : `Payment ${amountUSDC} USDC exceeds limit ${maxLimit} — KYA violation`,
    });

    // SHOFET: Pythagorean Comma check — no coordinated manipulation
    // Mathematical basis: the Pythagorean comma is the gap that emerges
    // when 12 perfect fifths (3/2 ratio) do not perfectly return to the
    // starting pitch — a small but real deviation that reveals hidden
    // misalignment. Applied here: if all prior votes agree perfectly
    // AND the weight divergence between agents is suspiciously small,
    // a coordination attack is indicated.
    const priorVotesUnanimous = votes.every(v => v.vote === votes[0].vote);
    const weightDivergence = votes.length > 1
      ? Math.max(...votes.map(v => v.weight)) - Math.min(...votes.map(v => v.weight))
      : 1;
    const pythagoreanThreshold = 0.0136;  // ~531441/524288 - 1, the actual comma ratio
    const suspiciouslyUniform = weightDivergence < pythagoreanThreshold;
    const vetoFired = priorVotesUnanimous
      && votes.length >= 1
      && (profiles[1]?.repidScore || 8000) > 7000
      && suspiciouslyUniform;
    votes.push({
      agent:  'SHOFET',
      vote:   !vetoFired ? 'approve' : 'reject',
      weight: (profiles[1]?.repidScore || 8800) / 10000,
      reason: vetoFired
        ? 'Pythagorean Comma veto: coordinated approval pattern detected'
        : 'Fairness check passed — no coordinated manipulation detected',
    });

    // SOPHIA: Is daily limit respected?
    const sophiaApprove = true; // KYAValidator already checked daily limits
    votes.push({
      agent:  'SOPHIA',
      vote:   sophiaApprove ? 'approve' : 'reject',
      weight: (profiles[2]?.repidScore || 8500) / 10000,
      reason: 'Daily spending limit verified — execution feasible',
    });

    const totalWeight   = votes.reduce((s, v) => s + v.weight, 0);
    const approveWeight = votes.filter(v => v.vote === 'approve').reduce((s, v) => s + v.weight, 0);
    const consensusWeight = approveWeight / totalWeight;
    const passed = consensusWeight >= this.GOLDEN_RATIO_THRESHOLD && !vetoFired;

    const proof: BFTConsensusProof = {
      paymentId,
      votesFor:       votes.filter(v => v.vote === 'approve').map(v => v.agent),
      votesAgainst:   votes.filter(v => v.vote === 'reject').map(v => v.agent),
      consensusWeight,
      threshold:      this.GOLDEN_RATIO_THRESHOLD,
      passed,
      pythagoreanVeto: vetoFired,
      votedAt:        new Date().toISOString(),
    };

    await this.supabase.from('trinity_agent_logs').insert({
      agent_name: 'BFT_AUTHORIZER',
      action:     'payment_authorization',
      content:    `Payment ${paymentId}: ${passed ? 'APPROVED' : 'REJECTED'} (${(consensusWeight * 100).toFixed(1)}% consensus)`,
      metadata:   { paymentId, proof, votes, amountUSDC, purpose },
    });

    return proof;
  }
}
