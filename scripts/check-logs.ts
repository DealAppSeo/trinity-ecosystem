
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkRecentErrors() {
    console.log('🔍 Fetching recent error logs from Supabase...');
    const { data, error } = await supabase
        .from('trinity_agent_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('❌ Error fetching logs:', error.message);
        return;
    }

    if (!data || data.length === 0) {
        console.log('ℹ️ No recent logs found.');
        return;
    }

    data.forEach(log => {
        const time = new Date(log.created_at).toLocaleTimeString();
        console.log(`[${time}] [${log.agent_name}] ${log.action}: ${log.message}`);
        if (log.metadata) console.log(`   Meta: ${JSON.stringify(log.metadata)}`);
    });
}

checkRecentErrors();
