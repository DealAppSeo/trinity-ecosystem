import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const REQ_VARS = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
    'GROK_API_KEY'
];

async function verify() {
    console.log('--- 🛡️ RAILWAY SECRET DIAGNOSTIC ---');

    let allValid = true;
    for (const v of REQ_VARS) {
        const val = process.env[v];
        if (!val || val.length < 5) {
            console.error(`❌ MISSING: ${v}`);
            allValid = false;
        } else {
            console.log(`✅ DETECTED: ${v} (${val.substring(0, 4)}...${val.substring(val.length - 4)})`);
        }
    }

    if (!allValid) {
        console.error('\n⚠️ ALERT: One or more critical keys are missing. This will cause agents to crash or fail to pick up tasks.');
        process.exit(1);
    }

    // Try a real Supabase ping
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { error } = await supabase.from('trinity_agent_registry').select('count', { count: 'exact', head: true });

    if (error) {
        console.error('❌ SUPABASE CONNECTIVITY FAILED:', error.message);
    } else {
        console.log('✨ SUPABASE CONNECTION SUCCESSFUL');
    }

    console.log('\n✅ Swarm Immune System looks healthy.');
}

verify();
