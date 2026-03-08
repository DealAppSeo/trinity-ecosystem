import { storeDecision } from '../recall/RecallMemory';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * APM: Evaluation logic for portfolio risk and autonomy.
 */
export async function evaluateTrade(params: {
    signal: { asset: string; direction: string; confidence: number };
    validationResult: { approved: boolean; driftTier: string; evidenceCID: string };
    amountUSDC: number;
    currentRepId: number;
    dailyPnL: number;
    maxDailyDrawdown: number;
}): Promise<{
    decision: 'EXECUTE' | 'NOTIFY' | 'ESCALATE' | 'BLOCKED';
    autonomyTier: 'JUST_DO_IT' | 'DO_THEN_TELL' | 'ASK_FIRST';
    tradeIntent: any;
    decisionCID: string;
}> {
    const { signal, validationResult, amountUSDC, currentRepId, dailyPnL, maxDailyDrawdown } = params;

    // 1. Check Circuit Breaker
    if (dailyPnL < -maxDailyDrawdown) {
        return handleBlocked(validationResult.evidenceCID, 'circuit_breaker_active');
    }

    // 2. Check Validation Rejection
    if (!validationResult.approved) {
        return handleBlocked(validationResult.evidenceCID, 'veritas_veto');
    }

    // 3. Dynamic RepID Threshold (P-011)
    const threshold = Math.floor(2000 * Math.log10(amountUSDC * 1000 + 1));

    let autonomyTier: 'JUST_DO_IT' | 'DO_THEN_TELL' | 'ASK_FIRST';
    let decision: 'EXECUTE' | 'NOTIFY' | 'ESCALATE';

    if (currentRepId >= threshold && signal.confidence >= 0.8) {
        autonomyTier = 'JUST_DO_IT';
        decision = 'EXECUTE';
    } else if (currentRepId >= threshold * 0.5) {
        autonomyTier = 'DO_THEN_TELL';
        decision = 'NOTIFY';
    } else {
        autonomyTier = 'ASK_FIRST';
        decision = 'ESCALATE';
    }

    const tradeIntent = {
        asset: signal.asset,
        direction: signal.direction,
        amountUSDC,
        autonomyTier,
        timestamp: new Date().toISOString(),
    };

    // Get APM Agent ID
    const { data: apmData } = await supabase
        .from('agent_registry')
        .select('erc8004_agent_id')
        .eq('agent_name', 'APM')
        .single();

    const decisionCID = await storeDecision({
        agentName: 'APM',
        erc8004AgentId: Number(apmData?.erc8004_agent_id || 0),
        decisionType: 'trade_intent',
        repIdAtDecision: currentRepId,
        autonomyTier,
        tradeIntent,
        linkedCIDs: [validationResult.evidenceCID],
        timestamp: new Date().toISOString(),
    });

    return { decision, autonomyTier, tradeIntent, decisionCID };
}

async function handleBlocked(evidenceCID: string, reason: string): Promise<any> {
    const { data: apmData } = await supabase
        .from('agent_registry')
        .select('erc8004_agent_id')
        .eq('agent_name', 'APM')
        .single();

    const decisionCID = await storeDecision({
        agentName: 'APM',
        erc8004AgentId: Number(apmData?.erc8004_agent_id || 0),
        decisionType: 'trade_intent',
        autonomyTier: 'ASK_FIRST',
        linkedCIDs: [evidenceCID],
        timestamp: new Date().toISOString(),
    });

    return { decision: 'BLOCKED', autonomyTier: 'ASK_FIRST', tradeIntent: null, decisionCID, reason };
}
