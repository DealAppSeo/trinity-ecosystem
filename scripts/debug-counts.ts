import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCounts() {
    console.log("📈 Database Integrity Check:");

    const { count: taskCount } = await supabase.from('trinity_tasks').select('*', { count: 'exact', head: true });
    const { count: artifactCount } = await supabase.from('trinity_artifacts').select('*', { count: 'exact', head: true });
    const { count: agentCount } = await supabase.from('trinity_agent_registry').select('*', { count: 'exact', head: true });
    const { count: hbCount } = await supabase.from('trinity_heartbeat').select('*', { count: 'exact', head: true });

    console.log(`- Tasks: ${taskCount}`);
    console.log(`- Artifacts: ${artifactCount}`);
    console.log(`- Agent Registry: ${agentCount}`);
    console.log(`- Heartbeats: ${hbCount}`);

    if (artifactCount === 0) {
        console.log("⚠️ WARNING: No artifacts found in DB!");
    }
}

checkCounts();
