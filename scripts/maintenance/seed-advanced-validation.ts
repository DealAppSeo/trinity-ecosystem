
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

const ADVANCED_MISSIONS = [
    {
        title: '[ALPHA] Blind Historic Backtest',
        description: 'Run models (LSTM/TFT) against 2023-2024 crypto data, blind to 2025. Validate out-of-sample accuracy and record RMSE/MAPE in artifacts.',
        priority: 60,
        task_type: 'research',
        assigned_to: 'trinity-veritas'
    },
    {
        title: '[GAMMA] Live Market Simulation',
        description: 'Take validated Alpha models and run real-time "Shadow Predictions" on today\'s BTC/USDT and ETH/USDT markets. Monitor for alpha capture.',
        priority: 70,
        task_type: 'simulation',
        assigned_to: 'trinity-nexus'
    },
    {
        title: '[ORCH] Triadic Resonance Synthesis',
        description: 'Synthesize a pattern recognition algo using the Circle of 5ths (3:2 ratio) and Pythagorean Comma. Apply Principle of Least Action for execution timing.',
        priority: 80,
        task_type: 'code',
        assigned_to: 'trinity-orch'
    },
    {
        title: '[BETA] Mutual Learning Audit',
        description: 'Audit the successes/failures of Gamma\'s live predictions. Create a "Model Learning" loop where agents update their specialty weights based on peer performance.',
        priority: 50,
        task_type: 'research',
        assigned_to: 'trinity-mel'
    }
];

async function seedAdvancedValidation() {
    console.log("🧬 Seeding Phase v2.7: Backtesting & Live Validation Swarm...");

    for (const mission of ADVANCED_MISSIONS) {
        const { error: seedError } = await supabase
            .from('trinity_tasks')
            .insert({
                ...mission,
                status: 'todo'
            });

        if (seedError) {
            console.error(`❌ Failed to seed mission "${mission.title}":`, seedError.message);
        } else {
            console.log(`✅ Seeded mission: ${mission.title}`);
        }
    }

    console.log("\n✨ Advanced Validation Missions Seeded!");
}

seedAdvancedValidation().catch(console.error);
