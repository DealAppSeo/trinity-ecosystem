import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function probeRegistry() {
    console.log("🔍 Probing trinity_agent_registry columns...");
    const { data, error } = await supabase.from('trinity_agent_registry').select('*').limit(1);

    if (error) {
        console.error("❌ Error:", error.message);
    } else if (data && data.length > 0) {
        console.log("✅ Columns:", Object.keys(data[0]));
    } else {
        console.log("⚠️ No data.");
    }
}

probeRegistry();
