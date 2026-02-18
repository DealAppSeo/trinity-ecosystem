import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkFailureReasons() {
    let output = '--- [STARTUP WEEKEND FAILURE ANALYSIS] ---\n\n';

    const { data: tasks, error: taskError } = await supabase
        .from('trinity_tasks')
        .select('id, title, status, result, completed_at, metadata')
        .or('title.ilike.%[STARTUP WEEKEND]%,title.ilike.%[SPRINT 0]%')
        .eq('status', 'failed')
        .order('completed_at', { ascending: false });

    if (taskError) {
        output += `Error fetching tasks: ${taskError.message}\n`;
        fs.writeFileSync('startup-failure-analysis.txt', output);
        return;
    }

    if (tasks) {
        for (const t of tasks) {
            output += `\n- [${t.id}] ${t.title}\n`;
            output += `  Failed At: ${t.completed_at}\n`;
            output += `  Result/Error: ${t.result}\n`;
            output += `  Metadata: ${JSON.stringify(t.metadata)}\n`;
            output += '  ---\n';
        }
    }

    output += '\n--- [ANALYSIS COMPLETE] ---\n';
    fs.writeFileSync('startup-failure-analysis.txt', output);
    console.log('Failure analysis written to startup-failure-analysis.txt');
}

checkFailureReasons();
