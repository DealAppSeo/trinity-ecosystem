import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectActive() {
    console.log("🔍 Inspecting Active Tasks and Metadata...");
    const { data } = await supabase
        .from('trinity_tasks')
        .select('id, status, title, claimed_by, started_at, metadata')
        .in('status', ['doing', 'in_progress']);

    data?.forEach(t => {
        console.log(`[${t.status}] ${t.title} | Claimed by: ${t.claimed_by} | Started: ${t.started_at} | Metadata: ${JSON.stringify(t.metadata)}`);
    });
}
inspectActive();
