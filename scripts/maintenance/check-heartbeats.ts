import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkHeartbeats() {
    console.log('💓 Checking Trinity Heartbeats...');

    // Get all heartbeats
    const { data: heartbeats, error } = await supabase
        .from('trinity_heartbeat')
        .select('*')
        .order('last_seen', { ascending: false });

    if (error) {
        console.error('❌ Failed:', error.message);
        return;
    }

    const now = new Date();
    console.log('🕒 Current Time (UTC):', now.toISOString());

    heartbeats.forEach(hb => {
        const lastSeen = new Date(hb.last_seen);
        const diffMs = now.getTime() - lastSeen.getTime();
        const diffMins = (diffMs / 60000).toFixed(1);

        let status = '🟢 ALIVE';
        if (diffMs > 120000) status = '🔴 DEAD'; // 2 mins

        console.log(`[${status}] ${hb.agent.padEnd(20)} | Last Seen: ${hb.last_seen} (${diffMins} mins ago)`);
    });
}

checkHeartbeats();
