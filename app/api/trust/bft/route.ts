// Trust Mechanism Sprint — Created April 5 2026 by Gemini

import { NextRequest, NextResponse } from 'next/server';
import { bftEngine } from '@/lib/trust/BFTEngine';

export async function POST(req: NextRequest) {
  try {
    const { claim, context } = await req.json();
    if (!claim) {
      return NextResponse.json({ error: 'claim required' }, { status: 400 });
    }
    const result = await bftEngine.vote(claim, context || '');
    return NextResponse.json({
      claim,
      consensus_reached: result.consensus_reached,
      consensus_score: result.consensus_score,
      threshold: result.threshold,
      pythagorean_veto: result.pythagorean_veto_fired,
      comma_gap: result.comma_gap,
      comma_severity: result.comma_severity,
      hitl_required: result.hitl_required,
      winning_output: result.winning_output,
      dissenting_providers: result.dissenting_providers,
      votes: result.votes.map(v => ({
        provider: v.provider,
        squad: v.squad,
        belief: v.belief,
        disbelief: v.disbelief,
        weight: v.weight,
        output: v.output,
        latency_ms: v.latency_ms,
      })),
      proof_hash: result.proof_hash,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET: Test with a known wrong claim
export async function GET(req: NextRequest) {
  const testClaim = req.nextUrl.searchParams.get('claim')
    || 'The BFT consensus threshold is 0.667 (2/3 majority)';
  const result = await bftEngine.vote(testClaim);
  return NextResponse.json(result);
}
