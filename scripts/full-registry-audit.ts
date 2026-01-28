import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function fullAudit() {
    console.log('--- [FULL REGISTRY AUDIT] ---');
    const { data, error } = await supabase
        .from('trinity_agent_registry')
        .select('*');

    if (error) {
        console.error('Error:', error.message);
        return;
    }

    console.log(`Total Registered Entities: ${data.length}`);
    data.sort((a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime()).forEach(a => {
        const lastActive = new Date(a.last_active);
        const minutesAgo = Math.round((Date.now() - lastActive.getTime()) / 60000);
        console.log(`[${a.status.toUpperCase()}] ${a.agent_name.padEnd(20)} | Last: ${minutesAgo}m ago | Task: ${a.current_task_summary}`);
    });
}

fullAudit();
