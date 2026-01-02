import { NextResponse } from 'next/server';
import { ConstitutionalAgent } from '@/lib/agent/ConstitutionalAgent';
import { GCM } from '@/lib/agent/GCM';

// Prevent vercel from caching this route
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const results = [];

        // 1. Instantiate Core Agents for Strategy 10 (Reflection)
        const agentNames = ['APM', 'HDM', 'MEL', 'GCM', 'TORCH', 'VERITAS', 'W3C', 'MCP'];

        for (const name of agentNames) {
            if (name === 'GCM') continue; // GCM is special class
            const agent = new ConstitutionalAgent({ name });
            await agent.retrospective();
            results.push(`${name} reflected.`);
        }

        // 2. Run GCM for Strategy 9 (Analysis)
        const gcm = new GCM();
        await gcm.retrospective(); // GCM reflects too
        await gcm.identifySkillGaps(); // Then analyzes others
        results.push('GCM reflected and analyzed gaps.');

        return NextResponse.json({ success: true, message: 'Swarm cycle complete', details: results });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
