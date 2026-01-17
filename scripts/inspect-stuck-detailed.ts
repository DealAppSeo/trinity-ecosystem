import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectStuck() {
    console.log("🔍 Inspecting ALL Non-Pending Tasks...");

    const { data, error } = await supabase
        .from('trinity_tasks')
        .select('*')
        .neq('status', 'pending')
        .neq('status', 'done')
        .neq('status', 'verified');

    if (error) {
        console.error("Error:", error.message);
        return;
    }

    if (!data || data.length === 0) {
        console.log("✅ No tasks stuck in intermediate states.");
        return;
    }

    data.forEach(t => {
        console.log(`[${t.status}] ${t.title} | Claimed by: ${t.claimed_by} | Started: ${t.started_at || t.created_at}`);
    });
}

inspectStuck();
