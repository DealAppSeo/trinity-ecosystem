
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStatus() {
    console.log('--- Agent Registry ---');
    const { data: registry, error: regError } = await supabase
        .from('trinity_agent_registry')
        .select('*')
        .in('agent_name', ['trinity-chesed', 'trinity-nexus', 'trinity-sophia']);

    if (regError) console.error(regError);
    else console.table(registry);

    console.log('\n--- Heartbeat ---');
    const { data: heartbeats, error: hbError } = await supabase
        .from('trinity_heartbeat')
        .select('*')
        .in('agent', ['trinity-chesed', 'trinity-nexus', 'trinity-sophia']);

    if (hbError) console.error(hbError);
    else console.table(heartbeats);
}

checkStatus();
