import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAgentStatus() {
    let output = '--- [AGENT STATUS REPORT] ---\n';

    const { data: agents, error } = await supabase
        .from('trinity_agent_registry')
        .select('*')
        .order('last_active', { ascending: false });

    if (error) {
        output += `Error fetching registry: ${error.message}\n`;
        fs.writeFileSync('agent-status-report.txt', output);
        return;
    }

    const now = new Date();
    output += `Current Time (UTC): ${now.toISOString()}\n\n`;
    output += `Found ${agents?.length || 0} registered agents:\n`;

    if (agents) {
        agents.forEach(a => {
            const lastActive = a.last_active ? new Date(a.last_active) : null;
            let diffMin = -1;
            if (lastActive) {
                const diffMs = now.getTime() - lastActive.getTime();
                diffMin = Math.floor(diffMs / 60000);
            }

            let status = 'OFFLINE';
            if (diffMin >= 0 && diffMin < 5) status = 'ONLINE';
            else if (diffMin >= 0 && diffMin < 15) status = 'STALE';

            output += `- [${a.agent_name}] Status: ${status} | Last Active: ${a.last_active} (${diffMin} mins ago)\n`;
            output += `  Tasks Completed: ${a.tasks_completed} | Summary: ${a.current_task_summary}\n`;
            output += '  ---\n';
        });
    }

    output += '\n--- [REPORT COMPLETE] ---\n';
    fs.writeFileSync('agent-status-report.txt', output);
}

checkAgentStatus();
