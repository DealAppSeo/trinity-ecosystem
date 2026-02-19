
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const dotenv = require('dotenv');

// Load Env
const envPath = path.resolve(__dirname, '../.env.local');
const result = dotenv.config({ path: envPath });

console.log('Loaded env from:', envPath);
if (result.error) {
    console.error('Error loading .env.local:', result.error.message);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// User provided token override (for testing)
const USER_TOKEN = 'sbp_26d73d2848911092f212ccfba83e32fd939eb9f9';

console.log('--- Configuration ---');
console.log('URL:', SUPABASE_URL ? 'Set' : 'Missing');
console.log('KEY:', SUPABASE_KEY ? 'Set (starts with ' + SUPABASE_KEY.substring(0, 5) + '...)' : 'Missing');
console.log('USER_TOKEN:', USER_TOKEN ? 'Set' : 'Missing');

async function testConnection(key, label) {
    if (!SUPABASE_URL || !key) {
        console.log(`[${label}] Skipping - Missing URL or Key`);
        return;
    }

    try {
        console.log(`\n[${label}] Testing connection...`);
        const supabase = createClient(SUPABASE_URL, key);

        // Try a simple query
        const { data, error } = await supabase.from('trinity_agent_registry').select('count', { count: 'exact', head: true });

        if (error) {
            console.error(`[${label}] ❌ Failed: ${error.message}`);
        } else {
            console.log(`[${label}] ✅ Success! Access Verified.`);
        }
    } catch (e) {
        console.error(`[${label}] ❌ Exception: ${e.message}`);
    }
}

async function run() {
    await testConnection(SUPABASE_KEY, 'ENV_KEY');
    await testConnection(USER_TOKEN, 'USER_TOKEN');
}

run();
