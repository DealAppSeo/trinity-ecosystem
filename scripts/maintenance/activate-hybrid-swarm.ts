
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing Supabase environment variables.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const AGENTS = [
    'trinity-orch', 'trinity-w3c', 'trinity-shofet',
    'trinity-torch', 'trinity-veritas', 'trinity-gcm',
    'trinity-mel', 'trinity-chesed', 'trinity-apm',
    'trinity-hdm', 'trinity-sophia', 'trinity-nexus'
];

const MISSIONS = [
    {
        title: '[ORCH] Meta-Protocol Consistency',
        description: 'Implement Sheaf-theoretic checks to detect "pairwise agreement traps" in market predictions. Operationalize global-to-local gluing tests.',
        priority: 10,
        task_type: 'system',
        assigned_to: 'trinity-orch'
    },
    {
        title: '[ALPHA] Tail-Risk & Byzantine Audit',
        description: 'Use Large Deviations framing to bound catastrophic failure probabilities in high-volatility scenarios. Audit model output for correlated halucination.',
        priority: 9,
        task_type: 'research',
        assigned_to: 'trinity-veritas'
    },
    {
        title: '[BETA] Visual Coherence & Tension',
        description: 'Use the Tritone Principle to evaluate squad disagreement/tension. Prepare data for the Pulse HUD visualization of agent "cognitive friction".',
        priority: 8,
        task_type: 'content',
        assigned_to: 'trinity-mel'
    },
    {
        title: '[GAMMA] Core Model Simulation',
        description: 'Benchmark LSTM, GRU, and TFT models against XGBoost for Bitcoin price prediction. Record performance metrics (MSE, MAPE) in artifacts.',
        priority: 10,
        task_type: 'code',
        assigned_to: 'trinity-nexus'
    },
    {
        title: '[SYSTEM] Pattern & Anomaly Detection',
        description: 'Track agent predictions and combinations of algorithms/theories. Alert via Telegram for high-confidence opportunities or significant anomalies.',
        priority: 10,
        task_type: 'system',
        assigned_to: 'trinity-orch'
    }
];

async function activateSwarm() {
    console.log("🚀 Activating Hybrid Crypto Prediction Swarm...");

    // 1. Wake Agents
    const { error: wakeError } = await supabase
        .from('trinity_agent_registry')
        .update({ status: 'online' })
        .in('agent_name', AGENTS);

    if (wakeError) {
        console.error("❌ Failed to wake agents:", wakeError.message);
    } else {
        console.log("✅ All 12 agents set to 'online' status.");
    }

    // 2. Seed Missions
    for (const mission of MISSIONS) {
        const { error: seedError } = await supabase
            .from('trinity_tasks')
            .insert({
                ...mission,
                status: 'pending'
            });

        if (seedError) {
            console.error(`❌ Failed to seed mission "${mission.title}":`, seedError.message);
        } else {
            console.log(`✅ Seeded mission: ${mission.title}`);
        }
    }

    console.log("\n✨ Swarm Activated and Missions Seeded!");
}

activateSwarm().catch(console.error);
