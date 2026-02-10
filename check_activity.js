
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

async function checkActivity() {
    console.log('--- AGENT REGISTRY & LAST ACTIVE ---');
    const { data: agents } = await supabase.from('trinity_agent_registry').select('agent_name, last_active, current_tier');
    if (agents) {
        agents.forEach(a => {
            console.log(`[${a.agent_name}] Last Active: ${a.last_active} | Tier: ${a.current_tier}`);
        });
    }

    console.log('\n--- LATEST HEARTBEATS (TOP 20) ---');
    const { data: hbs } = await supabase
        .from('trinity_heartbeat')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

    if (hbs) {
        hbs.forEach(h => {
            console.log(`[${h.created_at}] ${h.agent_name}: ${h.status_message} (${h.status})`);
        });
    } else {
        console.log('No heartbeats found.');
    }
}

checkActivity();
