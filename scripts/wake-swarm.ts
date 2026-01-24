import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const DORMANT_AGENTS = ['trinity-chesed', 'trinity-nexus', 'trinity-shofet', 'trinity-sophia', 'trinity-torch', 'trinity-w3c'];

async function wakeSwarm() {
    console.log('⚡ Initiating Swarm Wakeup Protocol...');
    const now = new Date().toISOString();

    for (const agent of DORMANT_AGENTS) {
        console.log(`📡 Sending pulse to ${agent}...`);
        await supabase
            .from('trinity_agent_registry')
            .update({
                status: 'online',
                last_active: now,
                current_task_summary: 'System waking...'
            })
            .eq('agent_name', agent);
    }

    console.log('✅ Status pulse sent. If agents do not appear online in dashboard, please ensure Railway services are running.');
}

wakeSwarm();
