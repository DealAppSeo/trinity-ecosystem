import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectLogsTable() {
    console.log("🔍 Inspecting trinity_agent_logs table...");

    const { data: cols, error } = await supabase.rpc('get_table_info', { table_name_input: 'trinity_agent_logs' });

    if (error) {
        console.log("RPC get_table_info failed, trying select trick...");
        // Try to select one row and look at keys
        const { data, error: selectError } = await supabase.from('trinity_agent_logs').select('*').limit(1);
        if (selectError) {
            console.error("Select failed:", selectError.message);
        } else if (data && data.length > 0) {
            console.log("✅ Columns found via select:", Object.keys(data[0]));
        } else {
            console.log("⚠️ No rows found, cannot determine columns via select.");
        }
    } else {
        console.log("✅ Columns found via RPC:", cols);
    }
}

inspectLogsTable();
