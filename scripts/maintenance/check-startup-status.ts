import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStartupStatus() {
    let output = '--- [STARTUP WEEKEND STATUS CHECK] ---\n\n';

    // 1. Check Tasks
    const { data: tasks, error: taskError } = await supabase
        .from('trinity_tasks')
        .select('*')
        .or('title.ilike.%[STARTUP WEEKEND]%,title.ilike.%[SPRINT 0]%')
        .order('priority', { ascending: false });

    if (taskError) {
        output += `Error fetching tasks: ${taskError.message}\n`;
        fs.writeFileSync('startup-status-report.txt', output);
        return;
    }

    output += `Found ${tasks?.length || 0} Startup-related tasks:\n`;

    if (tasks) {
        for (const t of tasks) {
            output += `\n- [${t.id}] ${t.title}\n`;
            output += `  Status: ${t.status} | Assigned: ${t.assigned_to} | Claimed: ${t.claimed_by}\n`;

            // 2. Check for related artifacts
            const { data: artifacts, error: artError } = await supabase
                .from('trinity_artifacts')
                .select('id, title, artifact_type, created_at')
                .eq('task_id', t.id);

            if (artError) {
                output += `  ⚠️ Error fetching artifacts for task ${t.id}: ${artError.message}\n`;
            } else if (artifacts && artifacts.length > 0) {
                output += `  ✅ Artifacts (${artifacts.length}):\n`;
                artifacts.forEach(a => {
                    output += `    - [${a.id}] ${a.title} (${a.artifact_type}) [Created: ${a.created_at}]\n`;
                });
            } else {
                output += `  ❌ No artifacts found for this task.\n`;
            }
            output += '  ---\n';
        }
    }

    output += '\n--- [CHECK COMPLETE] ---\n';
    fs.writeFileSync('startup-status-report.txt', output);
    console.log('Report written to startup-status-report.txt');
}

checkStartupStatus();
