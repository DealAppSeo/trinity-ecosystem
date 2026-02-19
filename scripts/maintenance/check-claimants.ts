import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkClaimants() {
    console.log("🔍 Inspecting Task Claimants...");
    const { data } = await supabase
        .from('trinity_tasks')
        .select('status, claimed_by, title')
        .in('status', ['doing', 'in_progress']);

    const counts: any = {};
    data?.forEach(t => {
        counts[t.claimed_by || 'unknown'] = (counts[t.claimed_by] || 0) + 1;
        console.log(`- ${t.status} | ${t.claimed_by} | ${t.title.substring(0, 40)}`);
    });
    console.log("📊 Claimant Summary:", counts);
}
checkClaimants();
