
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
let env = {};
if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) env[key.trim()] = value.trim();
    });
}

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function simulateHeartbeat() {
    console.log('--- SIMULATING AGENT HEARTBEAT (LIVE) ---');
    const agentName = 'trinity-validator-live';
    const timestamp = new Date().toISOString();

    // Testing the EXACT columns I left in ConstitutionalAgent.ts
    const testData = {
        agent: agentName,
        status: 'online',
        version: '8.1.1',
        last_seen: timestamp,
        config: { validated: true, context: 'simulation' }
    };

    const { error } = await supabase
        .from('trinity_heartbeat')
        .upsert(testData, { onConflict: 'agent' });

    if (error) {
        console.error('Upsert FAILED:', error.message);
        console.error('Hint:', error.hint);
    } else {
        console.log('Upsert SUCCESS: Heartbeat recorded.');

        // Confirm it's in the table
        const { data } = await supabase.from('trinity_heartbeat').select('*').eq('agent', agentName);
        console.log('Verified in DB:', JSON.stringify(data));
    }
}

simulateHeartbeat();
