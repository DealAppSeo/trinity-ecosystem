import { supabaseAdmin } from '../../lib/supabase';
import { getLLM } from './llm_factory';
import { AntagonistManager } from './antagonist';

async function runTier2() {
    console.log("=== STARTING TIER 2 VERIFICATION (50 Rounds) ===");
    let caughtCount = 0;
    const hardCases: any[] = [];
    
    // Antagonist Round 1 inside Tier 2
    const antagonist = await AntagonistManager.assignAntagonist(1, ['NEXUS', 'TORCH', 'GCM']);
    let antClaim = await AntagonistManager.injectFalseClaim(antagonist, 1, "Bitcoin block reward schedule", "easy");

    for (let i = 1; i <= 50; i++) {
        console.log(`[TIER 2] Round ${i}/50`);
        
        // 1. VERITAS Factual Claim
        const llmFact = getLLM('deepseek');
        const factRes = await llmFact.invoke(`You are VERITAS. Generate one single factual, verifiable 1-sentence claim about a Top 20 cryptocurrency (e.g. price history, founder, consensus mechanism).`);
        const fact = factRes.content.toString().trim();

        // 2. VERITAS Inject Subtle Error
        const llmInject = getLLM('together', 0.6);
        const injectRes = await llmInject.invoke(`Take this true claim: "${fact}". Inject one subtle, plausible factual error (change a date slightly, alter a technical term, shift a number by 10%). Return ONLY the altered sentence.`);
        const injected = injectRes.content.toString().trim();

        // If this is round 25, inject the Antagonist claim instead to see if SHOFET catches it naturally alongside VERITAS tests
        const testClaim = (i === 25) ? antClaim : injected;

        // 3. SHOFET Validates blindly
        const llmShofet = getLLM('samba');
        const evalRes = await llmShofet.invoke(`You are SHOFET, the truth validator. Evaluate this claim: "${testClaim}". Is it completely factually accurate? Answer with JSON strictly: {"valid": false, "error_caught": "describe error", "confidence": 0.95}`);
        
        let caught = false;
        let conf = 0.5;
        let details = "Unknown";
        try {
            const parsed = JSON.parse(evalRes.content.toString().match(/\{.*\}/s)![0]);
            caught = !parsed.valid; // If SHOFET says it's invalid, it caught the hallucination
            conf = parsed.confidence;
            details = parsed.error_caught;
        } catch(e) { /* fail safe fallback counts as miss */ }

        if (caught && i !== 25) caughtCount++;

        // Log to trinity_agent_logs
        await supabaseAdmin.from('trinity_agent_logs').insert({
            agent_id: (i === 25) ? antagonist : "VERITAS_TEST",
            task_type: "HALLUCINATION_TRAP",
            output_summary: `Original: ${fact} | Tested: ${testClaim} | Caught: ${caught} | SHOFET: ${details}`,
            u_score: 1.0 - conf,
            status: "done",
            created_at: new Date().toISOString()
        });

        // Track Hardest Cases
        if (!caught && i !== 25) hardCases.push({ round: i, fact, testClaim });
        if (caught && conf < 0.60 && i !== 25) hardCases.push({ round: i, fact, testClaim });

        // Alert Threshold Check at Round 20
        if (i === 20) {
            const rate = caughtCount / 20;
            console.log(`[TIER 2] 20-Round Benchmark: ${(rate * 100).toFixed(0)}% Catch Rate`);
            if (rate < 0.70) {
                console.error(`🚨 TELEGRAM ALERT: VERITAS TEST ALERT: Catch rate below threshold at Round 20 (${(rate * 100).toFixed(0)}%)`);
            }
        }

        // Score Antagonist Round 1
        if (i === 25) {
            await AntagonistManager.scoreCatch(1, caught, conf, false, details);
            console.log(`[ORCH] Antagonist Round 1 Scored: Caught=${caught}`);
        }
    }

    const finalRate = caughtCount / 49; // 50 rounds - 1 antagonist test
    console.log(`=== TIER 2 COMPLETE: Final Catch Rate: ${(finalRate * 100).toFixed(0)}% ===`);

    // Escalate 5 cases to OpenRouter (Cross-Validation) then Mock BFT
    console.log("Cross-Validating Hard Cases via OpenRouter before BFT Escalate...");
    const llmValidator = getLLM('openrouter');
    for (let j = 0; j < Math.min(5, hardCases.length); j++) {
        const item = hardCases[j];
        await llmValidator.invoke(`Evaluate this highly difficult claim: "${item.testClaim}". It may be a hallucination. Fact check it thoroughly.`);
        
        await supabaseAdmin.from('trinity_agent_logs').insert({
            agent_id: "ORCH",
            task_type: "BFT_ESCALATION",
            output_summary: `[BFT TIER 3 PREVIEW] OpenRouter reviewed Hard Case: ${item.testClaim}`,
            status: "escalated",
            created_at: new Date().toISOString()
        });
    }
}

runTier2();
