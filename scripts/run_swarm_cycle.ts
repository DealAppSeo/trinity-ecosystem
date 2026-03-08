import { gatherSignal } from '../lib/agents/NexusAgent';
import { validateSignal } from '../lib/agents/VeritasAgent';
import { evaluateTrade } from '../lib/agents/ApmAgent';
import { executeTrade } from '../lib/agents/SophiaAgent';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Main Swarm Pipeline: NEXUS -> VERITAS -> APM -> SOPHIA
 */
export async function runSwarmCycle(asset: string) {
    console.log(`\n=== Starting Swarm Cycle for ${asset} ===`);

    try {
        // 1. NEXUS: Signal Intelligence
        console.log('[Step 1] NEXUS is gathering signals...');
        const { signal, recallCID: signalCID } = await gatherSignal(asset);
        console.log(`[NEXUS] Signal: ${signal.predictedDirection} @ ${signal.price} (Confidence: ${signal.confidence.toFixed(2)})`);

        // 2. VERITAS: Protection & Validation
        console.log('[Step 2] VERITAS is validating signal drift...');

        // Attempt to get Nexus ID from Agent Registry
        const { data: nexusData } = await supabase
            .from('agent_registry')
            .select('erc8004_agent_id')
            .eq('agent_name', 'NEXUS')
            .single();

        const nexusId = Number(nexusData?.erc8004_agent_id || 0);

        const validationResult = await validateSignal(signal, signalCID, nexusId);
        console.log(`[VERITAS] Result: ${validationResult.driftTier} (Drift: ${validationResult.driftScore.toFixed(4)})`);

        if (!validationResult.approved) {
            console.log('[VERITAS] VETO: Pipeline halted for safety.');
            return;
        }

        // 3. APM: Portfolio Risk & Autonomy
        console.log('[Step 3] APM is evaluating trade risk...');

        // Fetch latest RepID for APM
        const { data: repData } = await supabase
            .from('agent_repid_score')
            .select('current_repid')
            .eq('agent_name', 'APM')
            .order('calculated_at', { ascending: false })
            .limit(1)
            .single();

        const apmResult = await evaluateTrade({
            signal,
            validationResult,
            amountUSDC: 100, // Demo amount
            currentRepId: repData?.current_repid || 5000,
            dailyPnL: 0,
            maxDailyDrawdown: 5,
        });

        console.log(`[APM] Decision: ${apmResult.decision} (Autonomy: ${apmResult.autonomyTier})`);

        if (apmResult.decision === 'BLOCKED') {
            console.log('[APM] Trade blocked by policy.');
            return;
        }

        // 4. SOPHIA: Execution & Reputation Feedback
        console.log('[Step 4] SOPHIA is executing trade intent...');
        const outcome = await executeTrade(apmResult.tradeIntent, apmResult.decisionCID);
        console.log(`[SOPHIA] Outcome: ${outcome.pnl > 0 ? 'PROFIT' : 'LOSS'} (${outcome.pnl.toFixed(2)} USDC)`);
        console.log(`[SOPHIA] On-chain feedback submitted. Cycle Complete.`);

    } catch (error) {
        console.error('[SwarmCycle] Error in pipeline:', error);
    }
}

// Dry run if executed directly
if (process.env.RUN_DRY) {
    runSwarmCycle('BTC').catch(console.error);
}
