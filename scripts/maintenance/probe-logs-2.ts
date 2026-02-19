import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function probeLogs() {
    console.log("🔍 Probing trinity_agent_logs with 'agent'...");
    const { error } = await supabase.from('trinity_agent_logs').insert({ agent: 'probe', message: 'test', action: 'probe' });
    if (error) {
        console.log("Error:", error.message);
    } else {
        console.log("✅ Success with { agent, message, action }");
    }
}
probeLogs();
