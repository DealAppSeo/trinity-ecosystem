import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchLogs() {
    console.log("=== FETCHING SBFA LOGS FROM SUPABASE ===");

    // Fetch latest sbfa_pi_terms log
    const { data, error } = await supabase
        .from('trinity_agent_logs')
        .select('*')
        .eq('action', 'sbfa_pi_terms')
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error("❌ Error fetching logs:", error.message);
        return;
    }

    if (data && data.length > 0) {
        console.log("✅ Found verifiable SBFA log entry:");
        console.log(JSON.stringify(data[0], null, 2));
    } else {
        console.log("⚠️ No sbfa_pi_terms logs found.");
    }
}

fetchLogs().then(() => process.exit(0));
