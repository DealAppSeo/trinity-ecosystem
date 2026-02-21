import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function fetchTIMLLogs() {
    console.log("=== FETCHING TIML ROUTING LOGS ===");
    const { data, error } = await supabase
        .from('trinity_agent_logs')
        .select('*')
        .or('action.eq.timl_routing_decision,action.eq.sbfa_pi_terms')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error("Error fetching logs:", error);
        return;
    }

    if (!data || data.length === 0) {
        console.log("No TIML logs found yet. The test may have failed before logging.");
        return;
    }

    data.forEach(log => {
        console.log(`[${log.created_at}] ${log.agent_name || log.agent} | ${log.action} | ${log.message}`);
        if (log.metadata) console.log(`   Metadata: ${JSON.stringify(log.metadata)}`);
    });
}

fetchTIMLLogs().catch(console.error);
