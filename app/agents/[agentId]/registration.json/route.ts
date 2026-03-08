
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(
    request: NextRequest,
    { params }: { params: { agentId: string } }
) {
    const agentName = params.agentId.toUpperCase();

    // 1. Fetch agent identity data
    const { data: agent } = await supabase
        .from('agent_registry')
        .select('*')
        .eq('agent_name', agentName)
        .single();

    if (!agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // 2. Fetch latest RepID score from compute_bids
    const { data: repData } = await supabase
        .from('compute_bids')
        .select('agent_repid_score')
        .eq('agent_id', agentName)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    const score = repData?.agent_repid_score ?? 0;

    // 3. Construct ERC-8004 spec-compliant registration file
    const registrationFile = {
        type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
        name: `Trinity-${agentName}`,
        description: agent.description || `Trinity Symphony Autonomous Agent: ${agentName}`,
        image: `https://aitrinitysymphony.com/agents/${agentName}.png`,
        services: [
            {
                name: 'MCP',
                endpoint: `https://aitrinitysymphony.com/mcp/${agentName}`,
                version: '2025-06-18'
            },
            {
                name: 'A2A',
                endpoint: 'https://aitrinitysymphony.com/.well-known/agent-card.json',
                version: '0.3.0'
            },
            {
                name: 'web',
                endpoint: `https://aitrinitysymphony.com/agents/${agentName}`
            }
        ],
        x402Support: true,
        active: true,
        registrations: [
            {
                agentId: agent.erc8004_agent_id,
                agentRegistry: `eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e`
            }
        ],
        // Trinity-specific extensions (as allowed by EIP-8004)
        trinity: {
            repIdScore: score,
            repIdTier: getRepIdTier(score),
            autonomyTiers: ['JUST_DO_IT', 'DO_THEN_TELL', 'ASK_FIRST'],
            bftThreshold: 0.618,
            driftDetection: 'VERITAS-DON',
            zkProofSupported: true
        }
    };

    return NextResponse.json(registrationFile, {
        headers: {
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
        }
    });
}

function getRepIdTier(score: number): string {
    if (score >= 8000) return 'DIAMOND';
    if (score >= 5000) return 'GOLD';
    if (score >= 2000) return 'SILVER';
    return 'BRONZE';
}
