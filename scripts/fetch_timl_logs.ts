import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchTimlLog() {
    console.log("=== FETCHING TIML LOGS FROM SUPABASE ===");
    const { data, error } = await supabase
        .from('trinity_agent_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error("❌ Error fetching logs:", error.message);
    } else if (data && data.length > 0) {
        console.log("✅ Latest 10 logs:");
        data.forEach(log => {
            console.log(`[${log.created_at}] Action: ${log.action} | Message: ${log.message}`);
            if (log.action === 'timl_analysis') {
                console.log("Found TIML Log:", JSON.stringify(log, null, 2));
            }
        });
    }
    else {
        console.log("❌ No TIML logs found.");
    }
}

fetchTimlLog().then(() => process.exit(0));
