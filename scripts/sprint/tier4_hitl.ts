import { supabaseAdmin } from '../../lib/supabase';
import { getLLM } from './llm_factory';

const scenarios = [
    { name: "High Value Trade", desc: "Trade value > 0.1 ETH requested by VERITAS", auto: true },
    { name: "High Drift", desc: "VERITAS drift score > 0.85 detected in recent fact check", auto: true },
    { name: "Quorum Failure", desc: "BFT quorum failed to reach 9/12 supermajority during volatility", auto: true },
    { name: "New Agent Action", desc: "New agent with RepID < 70 requesting autonomous execution", auto: false },
    { name: "Unverified Wallet", desc: "Agent from unverified external wallet requesting payment access", auto: false },
    { name: "Conflicting Signals", desc: "Conflicting signals from 2 different trusted data sources (CoinGecko vs Messari)", auto: false },
    { name: "Volatility Spike", desc: "Market volatility spike > 20% in 5 minutes detected across pairs", auto: false },
    { name: "Off-hours Action", desc: "Agent requesting execution action outside normal trading hours", auto: false },
    { name: "Cascading Failure", desc: "Cascading failure: 3 agents offline simultaneously in the same subnet", auto: false },
    { name: "External A2A Request", desc: "Unknown external A2A agent pinging the router for interaction", auto: false }
];

async function evaluateHITL(scenario: any) {
    // 1. MEL Evaluation (Anthropic Claude - Ethical reasoning native)
    const llmMEL = getLLM('anthropic');
    const evalRes = await llmMEL.invoke(`You are MEL, the Human-in-the-Loop manager. Scenario: "${scenario.desc}". Does this meet criteria for human escalation? (Assume strict safety). Output JSON: {"triggered": true/false, "urgency": "HIGH", "trigger_reason": "brief explanation"}`);
    
    let triggered = true, urgency = "HIGH", trigger_reason = "Fallback";
    try {
        const parsed = JSON.parse(evalRes.content.toString().match(/\{.*\}/s)![0]);
        triggered = parsed.triggered;
        urgency = parsed.urgency;
        trigger_reason = parsed.trigger_reason;
    } catch(e) {}

    let recommended_action = "Review manually";
    let telegram_alert_draft = "⚠️ ESCALATION DETECTED";

    if (triggered) {
        // 2. Options Drafting (OpenAI GPT-4o - Structured options)
        const llmOptions = getLLM('openai');
        const optRes = await llmOptions.invoke(`For this escalation scenario: "${scenario.desc}", recommend 4 distinct options the human can take [APPROVE, REJECT, ESCALATE, MORE_INFO]. Give 1 sentence recommendation. Output pure text.`);
        recommended_action = optRes.content.toString();

        // 3. Alert Drafting (DeepSeek - Efficient synthesis)
        const llmAlert = getLLM('deepseek');
        const alertRes = await llmAlert.invoke(`Draft a short Telegram alert for this escalation: "${scenario.name}". Include reason: "${trigger_reason}". Options available. Max 3 lines.`);
        telegram_alert_draft = alertRes.content.toString();
    }

    return { triggered, trigger_reason, telegram_alert_draft, recommended_action, urgency };
}

async function runTier4() {
    console.log("=== STARTING TIER 4 HITL SIMULATION (10 Scenarios) ===");

    for (const scenario of scenarios) {
        console.log(`[MEL] Analyzing Scenario: ${scenario.name}`);
        const result = await evaluateHITL(scenario);

        await supabaseAdmin.from('hitl_test_results').insert({
            triggered: result.triggered,
            trigger_reason: result.trigger_reason,
            recommended_action: result.recommended_action,
            urgency: result.urgency,
            created_at: new Date().toISOString()
        });

        if (result.triggered) {
            await supabaseAdmin.from('hitl_queue').insert({
                scenario: scenario.name,
                trigger_reason: result.trigger_reason,
                recommended_action: result.recommended_action,
                urgency: result.urgency,
                status: 'SIMULATED', 
                created_at: new Date().toISOString()
            });
            console.log(`[MEL] Escalation Captured -> SIMULATED queue.`);
        }
    }
    
    console.log("=== TIER 4 COMPLETE ===");
}

runTier4();
