import { NextResponse } from 'next/server';
import { zkpBadgeGenerator } from '@/lib/guardrail/ZKPReputationBadge';

export async function POST() {
    console.log('[API] 🛡️ Triggering Trust Audit via Swarm...');
    
    // Fire and forget or await? Let's await for the demo feedback
    try {
        const results = await zkpBadgeGenerator.measureTrustEffectiveness();
        return NextResponse.json({ success: true, results });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
