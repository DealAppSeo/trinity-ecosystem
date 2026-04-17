
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config({ path: 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runAudit() {
    console.log("🔍 Starting Phase 0 Session Audit...");
    const results = [];

    // 1. Check trinity_tasks.id type
    const { data: idType } = await supabase.rpc('get_column_info', { t_name: 'trinity_tasks', c_name: 'id' });
    // Note: get_column_info might not exist, using information_schema directly
    const { data: schemaInfo, error: schemaError } = await supabase.from('information_schema.columns')
        .select('data_type')
        .eq('table_name', 'trinity_tasks')
        .eq('column_name', 'id')
        .single();

    // Using a raw query instead as Supabase doesn't expose information_schema easily via .from()
    const { data: rawSchema, error: rawError } = await supabase.rpc('exec_sql', { sql_query: "SELECT data_type FROM information_schema.columns WHERE table_name = 'trinity_tasks' AND column_name = 'id'" });

    // Fallback: simple count and check 12 agents
    const { data: agents, error: agentsError } = await supabase.from('agents').select('id, status, repid_score').order('id');
    const agentCount = agents ? agents.length : 0;
    const allUpper = agents ? agents.every(a => a.id === a.id.toUpperCase()) : false;

    // Check for trigger
    const { data: triggerCheck } = await supabase.rpc('exec_sql', { sql_query: "SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'agents'" });

    // Check agent versions (simulation/file check)
    const agentBasePath = 'c:/Users/Cash4/OneDrive/Desktop/trinity-symphony-shared/constitutional-agent-base.js';
    let versionOk = false;
    try {
        const content = fs.readFileSync(agentBasePath, 'utf8');
        versionOk = content.includes('v8.1.0');
    } catch (e) {
        console.error("Error reading agent base file:", e.message);
    }

    // 4. Check Bayesian drift (stddev of confidence)
    const { data: driftData, error: driftError } = await supabase.rpc('exec_sql', {
        sql_query: "SELECT stddev(confidence_score) as sigma FROM db_routing_decisions WHERE created_at > NOW() - INTERVAL '7 days'"
    });
    // Fallback if table doesn't exist yet
    const sigma = driftData && driftData[0] ? driftData[0].sigma : 'N/A';

    results.push(`Agent Count: ${agentCount} (Expected 12)`);
    results.push(`All Agent IDs Uppercase: ${allUpper}`);
    results.push(`Spawn Control Version v8.1.x: ${versionOk}`);
    results.push(`Bayesian Drift Sigma (7d): ${sigma} (Threshold 0.15)`);

    console.log("Audit Results:", results);

    // Log to sprint_updates
    await supabase.from('sprint_updates').insert({
        agent_id: 'ANTIGRAV',
        update_type: 'session_audit',
        data: { results, timestamp: new Date().toISOString() }
    });

    console.log("✅ Audit logged to sprint_updates.");
}

runAudit();
