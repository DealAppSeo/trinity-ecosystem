
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const missingAgents = [
    { id: 'TORCH', name: 'TORCH', status: 'idle', repid_score: 85, capabilities: ['arbitrage', 'content_generation'], platform: 'Railway', metrics: { success_rate: 0.9, tasks_completed: 120 } },
    { id: 'CHESED', name: 'CHESED', status: 'idle', repid_score: 80, capabilities: ['wellbeing_logs', 'content_integrity'], platform: 'Railway', metrics: { success_rate: 0.85, tasks_completed: 80 } },
    { id: 'NEXUS', name: 'NEXUS', status: 'idle', repid_score: 82, capabilities: ['conflict_resolution', 'sync'], platform: 'Railway', metrics: { success_rate: 0.88, tasks_completed: 95 } },
    { id: 'SOPHIA', name: 'SOPHIA', status: 'idle', repid_score: 88, capabilities: ['strategy_optimization', 'analytics'], platform: 'Railway', metrics: { success_rate: 0.92, tasks_completed: 110 } },
    { id: 'W3C', name: 'W3C', status: 'idle', repid_score: 84, capabilities: ['cold_tier_authority', 'web3'], platform: 'Railway', metrics: { success_rate: 0.86, tasks_completed: 70 } },
    { id: 'SHOFET', name: 'SHOFET', status: 'idle', repid_score: 80, capabilities: ['ddl_arbitrator', 'governance'], platform: 'Railway', metrics: { success_rate: 0.8, tasks_completed: 50 } }
];

async function seed() {
    console.log("🚀 Seeding 12-agent registry...");

    // Rename ATS to ORCH
    const { error: renameError } = await supabase.from('agents').update({ id: 'ORCH', name: 'ORCH Orchestrator' }).eq('id', 'ATS');
    if (renameError) console.error("Error renaming ATS:", renameError.message);
    else console.log("✅ Renamed ATS to ORCH.");

    // Insert missing
    const { data, error } = await supabase.from('agents').upsert(missingAgents).select();
    if (error) {
        console.error("❌ Seeding failed:", error.message);
    } else {
        console.log(`✅ ${data.length} agents seeded/updated.`);
    }
}

seed();
