
import { NextRequest, NextResponse } from 'next/server';
import { zkpBadgeGenerator } from '@/lib/guardrail/ZKPReputationBadge';

/**
 * Phase 4.8: ZKP Proof Generation Endpoint
 * Returns a Plonky3/Circom proof that an agent's RepID >= minReputation.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { agentName, minReputation } = body;

        if (!agentName || minReputation === undefined) {
            return NextResponse.json({
                error: 'Missing required fields: agentName, minReputation'
            }, { status: 400 });
        }

        console.log(`[API-ZKP] Requesting proof for ${agentName} (Threshold: ${minReputation})`);

        const proofResult = await zkpBadgeGenerator.generateProof(agentName, minReputation);

        return NextResponse.json(proofResult, {
            headers: {
                'Cache-Control': 'no-store',
                'X-ZKP-Protocol': 'groth16',
                'X-ZKP-Version': '2.0.0'
            }
        });

    } catch (err: any) {
        console.error(`[API-ZKP] Error:`, err.message);
        return NextResponse.json({
            error: 'ZKP Proof Generation Failed',
            details: err.message
        }, { status: 500 });
    }
}
