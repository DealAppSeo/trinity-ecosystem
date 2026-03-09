import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export async function GET(
    request: NextRequest,
    { params }: { params: { agentId: string } }
) {
    const agentId = params.agentId.toUpperCase();
    const agentName = agentId; // Legacy mapping

    // 1. Fetch persistent identity from registry
    const { data: agentData } = await supabase
        .from('agent_registry')
        .select('*')
        .eq('agent_name', agentName)
        .single();

    // 2. Fetch latest RepID score
    const { data: repData } = await supabase
        .from('agent_repid_score')
        .select('current_repid')
        .eq('agent_name', agentName)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .single();

    const registrationFile = {
        type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
        name: agentName,
        description: getAgentDescription(agentName),
        image: `https://aitrinitysymphony.com/agents/${agentName}/avatar.png`,
        services: getAgentServices(agentName),
        x402Support: true,
        active: true,
        registrations: agentData?.erc8004_agent_id ? [{
            agentId: agentData.erc8004_agent_id,
            agentRegistry: `eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e`,
        }] : [],
        // Trinity extensions — our technical moat
        trinity_extensions: {
            repId: repData?.current_repid ?? 5000,
            repIdTier: getRepIdTier(repData?.current_repid ?? 5000),
            anfisEnabled: true,
            pythagoreanCommaVeto: agentName === 'VERITAS',
            bftConsensus: true,
            recallBucket: `trinity-${agentName.toLowerCase()}-decisions`,
            autonomyTiers: ["JUST_DO_IT", "DO_THEN_TELL", "ASK_FIRST"],
        }
    };

    return NextResponse.json(registrationFile, {
        headers: { 'Content-Type': 'application/json' }
    });
}

function getRepIdTier(repId: number): string {
    if (repId >= 8000) return 'DIAMOND';
    if (repId >= 6000) return 'GOLD';
    if (repId >= 4000) return 'SILVER';
    return 'BRONZE';
}

function getAgentDescription(name: string): string {
    const descriptions: Record<string, string> = {
        NEXUS: "Signal intelligence agent. Purchases verified market data via x402 micropayments. Multi-source signal aggregation with Pythagorean Comma pre-screening.",
        VERITAS: "Protection agent. Uses Pythagorean Comma mathematics to detect signal drift before capital deployment. Posts validation results to ERC-8004 Validation Registry.",
        APM: "Portfolio manager. RepID-gated decision making with dynamic thresholds. Circuit breaker at 5% daily drawdown. Routes 1-5% of profits to nonprofits via x402.",
        SOPHIA: "Execution agent. Submits TradeIntents to Surge. Records verified outcomes to ERC-8004 Reputation Registry with anti-Sybil payment proofs.",
    };
    return descriptions[name] || `Trinity agent ${name}`;
}

function getAgentServices(name: string) {
    return [
        { name: "A2A", endpoint: `https://aitrinitysymphony.com/agents/${name}/.well-known/agent-card.json` },
        { name: "MCP", endpoint: `https://mcp.aitrinitysymphony.com/${name}` },
    ];
}
