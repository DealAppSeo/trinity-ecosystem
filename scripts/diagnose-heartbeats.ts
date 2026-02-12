
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function diagnose() {
    console.log('🔍 Diagnosing Agent Ecosystem Status...');
    const now = new Date();
    console.log('🕒 Current UTC:', now.toISOString());

    const tables = [
        'trinity_agent_registry',
        'trinity_heartbeat',
        'agent_heartbeat',
        'agent_status'
    ];

    for (const table of tables) {
        console.log(`\n--- [Table: ${table}] ---`);
        const { data, error } = await supabase.from(table).select('*');
        if (error) {
            console.error(`❌ Error querying ${table}:`, error.message);
        } else if (!data || data.length === 0) {
            console.log(`⚠️ No data found in ${table}.`);
        } else {
            data.forEach(row => {
                const name = row.agent_name || row.agent || 'unknown';
                const lastActive = row.last_active || row.last_seen || row.last_ping || 'N/A';
                let diff = 'N/A';
                if (lastActive !== 'N/A') {
                    const diffMs = now.getTime() - new Date(lastActive).getTime();
                    diff = `${(diffMs / 60000).toFixed(1)} mins ago`;
                }
                console.log(`- ${name.padEnd(20)} | Last: ${lastActive} (${diff})`);
            });
        }
    }
}

diagnose();
