import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectTasks() {
    console.log("🔍 Summarizing trinity_tasks...");

    const { data, error } = await supabase
        .from('trinity_tasks')
        .select('status, assigned_to');

    if (error) {
        console.error("Error:", error.message);
        return;
    }

    const summary: any = {};
    const assignments: any = {};

    data.forEach(t => {
        summary[t.status] = (summary[t.status] || 0) + 1;
        assignments[t.assigned_to || 'unassigned'] = (assignments[t.assigned_to || 'unassigned'] || 0) + 1;
    });

    console.log("📊 Status Summary:", summary);
    console.log("👤 Assignment Summary:", assignments);
}

inspectTasks();
