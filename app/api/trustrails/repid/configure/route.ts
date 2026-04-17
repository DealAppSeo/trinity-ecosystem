// app/api/trustrails/repid/configure/route.ts
// TrustShell Sprint — Created March 26 2026 by Gemini

import { NextRequest, NextResponse } from 'next/server';
import { RepIDCalculator } from '@/lib/trustshell/RepIDConfig';

const calc = new RepIDCalculator();

export async function GET(req: NextRequest) {
  const institutionId = req.nextUrl.searchParams.get('institution') || 'default';
  const weights = await calc.getInstitutionWeights(institutionId);
  return NextResponse.json({ institutionId, weights });
}

export async function POST(req: NextRequest) {
  const { institutionId = 'default', weights } = await req.json();

  await calc.updateInstitutionWeights(institutionId, weights);

  const sophiaResult = await calc.calculate(
    'SOPHIA',
    { bftAccuracy: 94, veritasCatchRate: 97, x402SuccessRate: 100, latencyMs: 180, humanCustody: true },
    institutionId
  );

  return NextResponse.json({
    message: `Weights updated for ${institutionId}`,
    sophiaRepIDWithNewWeights: sophiaResult,
    demo: {
      story: 'Adjust weights to see how SOPHIA\'s RepID changes in real time.',
      aminaConservative: 'Set humanCustodyScore to 0.45 — SOPHIA\'s RepID emphasizes human oversight.',
      portfolioBalanced: 'Set x402SuccessRate to 0.25 — SOPHIA\'s RepID emphasizes payment performance.',
    },
  });
}


export const dynamic = 'force-dynamic';
