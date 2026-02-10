
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

async function testFinalHeartbeat() {
    console.log('--- FINAL HEARTBEAT TEST ---');
    const testData = {
        agent: 'trinity-test-validator',
        status: 'online',
        version: '8.1.1',
        last_seen: new Date().toISOString(),
        status_message: 'Verification logic confirmed.',
        config: { validated: true }
    };

    const { error } = await supabase
        .from('trinity_heartbeat')
        .upsert(testData, { onConflict: 'agent' });

    if (error) {
        console.error('Upsert FAILED:', error.message);
    } else {
        console.log('Upsert SUCCESS: System is now transparent.');
    }
}

testFinalHeartbeat();
