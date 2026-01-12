
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCrash() {
    console.log('🔍 Checking for Beta Squad (Claude) Logs...');

    // 1. Check recent logs for errors
    const { data: logs, error } = await supabase
        .from('trinity_agent_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) console.error('Log Error:', error.message);
    else {
        console.log('\n--- Recent Logs ---');
        logs.forEach(l => console.log(`[${l.created_at}] ${l.agent_name}: ${l.action} - ${l.message?.substring(0, 50)}`));
    }

    // 2. Check Heartbeats
    const { data: heartbeats } = await supabase
        .from('trinity_heartbeat')
        .select('*');

    console.log('\n--- Heartbeats ---');
    heartbeats?.forEach((h: any) => {
        const minAgo = (Date.now() - new Date(h.last_seen).getTime()) / 60000;
        console.log(`${h.agent}: Seen ${minAgo.toFixed(1)} mins ago (${h.status})`);
    });
}

checkCrash();
