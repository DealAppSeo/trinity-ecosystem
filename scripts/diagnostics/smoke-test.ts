
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function smokeTest() {
    const { count, error } = await supabase
        .from('trinity_agent_registry')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error("❌ Error querying trinity_agent_registry:", error.message);
    } else {
        console.log("✅ Successfully reached trinity_agent_registry.");
        console.log(`📊 Total Agents Found: ${count}`);
    }

    const { data: allAgents } = await supabase
        .from('trinity_agent_registry')
        .select('agent_name, status, squad, last_active');
    
    console.log("\n🤖 Agent List (Last Pulse):");
    const now = new Date();
    allAgents?.forEach(a => {
        const last = a.last_active ? new Date(a.last_active) : null;
        const diff = last ? (now.getTime() - last.getTime()) / 1000 : null; // seconds
        console.log(`- ${a.agent_name.padEnd(20)}: ${a.status.padEnd(10)} (Last: ${diff ? diff.toFixed(1) + 's ago' : 'N/A'})`);
    });
}

smokeTest().catch(console.error);
