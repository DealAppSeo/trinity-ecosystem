
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

const supabaseUrl = env['SUPABASE_URL'] || env['NEXT_PUBLIC_SUPABASE_URL'];
const serviceKey = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !serviceKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function simulateHeartbeatAdmin() {
    console.log('--- SIMULATING AGENT HEARTBEAT (ADMIN) ---');
    const agentName = 'trinity-validator-admin';
    const timestamp = new Date().toISOString();

    const testData = {
        agent: agentName,
        status: 'online',
        version: '8.1.1',
        last_seen: timestamp,
        config: { validated: true, context: 'admin-simulation' }
    };

    const { error } = await supabase
        .from('trinity_heartbeat')
        .upsert(testData, { onConflict: 'agent' });

    if (error) {
        console.error('Upsert FAILED:', error.message);
    } else {
        console.log('Upsert SUCCESS: Heartbeat recorded via Service Role.');

        // Confirm it's in the table
        const { data } = await supabase.from('trinity_heartbeat').select('*').eq('agent', agentName);
        console.log('Verified in DB:', JSON.stringify(data));
    }
}

simulateHeartbeatAdmin();
