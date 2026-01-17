import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyRecovery() {
    console.log("🏁 Verifying Post-Migration State...");

    // 1. Check for legacy names in registry
    const { data: legacyRegistry } = await supabase
        .from('trinity_agent_registry')
        .select('agent_name')
        .in('agent_name', ['ORCH', 'orch', 'MCP', 'MEL', 'APM']);

    if (legacyRegistry && legacyRegistry.length > 0) {
        console.log(`⚠️  Legacy agents still found in registry: ${legacyRegistry.map(a => a.agent_name).join(', ')}`);
    } else {
        console.log("✅ Registry cleaned of legacy names.");
    }

    // 2. Check for 'doing' tasks
    const { data: doingTasks } = await supabase
        .from('trinity_tasks')
        .select('id, title, status')
        .eq('status', 'doing');

    if (doingTasks && doingTasks.length > 0) {
        console.log(`⚠️  ${doingTasks.length} tasks still in 'doing' status.`);
    } else {
        console.log("✅ All 'doing' tasks have been reset.");
    }

    // 3. Check for trinity- prefixed agents
    const { data: trinityAgents } = await supabase
        .from('trinity_agent_registry')
        .select('agent_name')
        .like('agent_name', 'trinity-%');

    console.log(`📊 Found ${trinityAgents?.length || 0} agents with 'trinity-' prefix.`);
}

verifyRecovery();
