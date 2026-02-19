import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSchema() {
    console.log("🔍 Inspecting trinity_agent_logs schema...");
    const { data, error } = await supabase.from('trinity_agent_logs').select('*').limit(1);

    if (error) {
        console.error("❌ Error selecting from trinity_agent_logs:", error.message);
        // Fallback: try different column names to see which one works
        return;
    }

    if (data && data.length > 0) {
        console.log("✅ Sample data found. Columns:", Object.keys(data[0]));
    } else {
        console.log("⚠️ No data in trinity_agent_logs. Trying to fetch column names from information_schema...");

        // This RPC might not exist, but let's try a direct query if possible
        // Actually, we can't do direct SQL easily via JS without a specific RPC.
        // But we can try to insert a dummy record with all possible names and see which one fails.
    }
}

inspectSchema();
