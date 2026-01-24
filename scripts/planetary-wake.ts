import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const AGENTS = [
    'trinity-apm', 'trinity-gcm', 'trinity-hdm', 'trinity-mel',
    'trinity-nexus', 'trinity-torch', 'trinity-veritas', 'trinity-chesed',
    'trinity-sophia', 'trinity-w3c', 'trinity-orch', 'trinity-shofet'
];

async function planetaryWake() {
    console.log('🌌 INITIATING PLANETARY WAKE PROTOCOL...');

    const now = new Date().toISOString();

    for (const agent of AGENTS) {
        console.log(`📡 Pulsing ${agent}...`);
        const { error } = await supabase
            .from('trinity_agent_registry')
            .update({
                status: 'online',
                last_active: now,
                current_task_summary: '[WAKE] Awaiting directives from the Symphony Master.'
            })
            .eq('agent_name', agent);

        if (error) console.error(`❌ Failed to wake ${agent}:`, error.message);
    }

    console.log('\n✨ PLANETARY WAKE COMPLETE. All 12 agents marked as Online.');
    console.log('Note: Agents in Railway will pick up this pulse and begin their Pre-Init sequences.');
}

planetaryWake();
