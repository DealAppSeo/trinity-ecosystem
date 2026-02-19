
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Inject if still missing (Fallback)
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';
    process.env.SUPABASE_SERVICE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);


async function diagnose() {
    console.log("🕵️ Checking Test Tasks Status...");

    // Check the tasks we created previously
    const targetIds = [140970, 140972, 140974];

    // MONITOR ONLY
    const { data: tasks } = await supabase
        .from('trinity_tasks')
        .select('*')
        .in('id', targetIds);

    tasks?.forEach(t => {
        console.log(`Task ${t.id}: [${t.status}] Assigned: ${t.assigned_to}`);
        if (t.status === 'completed') {
            console.log(`   ✅ Result: ${t.result?.substring(0, 50)}...`);
        }
    });

    console.log("\n📦 Checking Recent Artifacts (Last 5)...");
    const { data: artifacts } = await supabase
        .from('trinity_artifacts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (artifacts && artifacts.length > 0) {
        artifacts.forEach(a => {
            console.log(`   📄 [${a.artifact_type}] ${a.title || 'Untitled'} (${a.file_path || 'No Path'})`);
        });
    } else {
        console.log("   ❌ No recent artifacts found.");
    }

    console.log("\n📜 Checking Recent Agent Logs (Errors only)...");
    const { data: logs } = await supabase
        .from('trinity_agent_logs')
        .select('*')
        .eq('level', 'error')
        .order('created_at', { ascending: false })
        .limit(5);

    if (logs && logs.length > 0) {
        logs.forEach(l => console.log(`   🔴 [${l.agent_name}] ${l.message}`));
    } else {
        console.log("   ✅ No recent error logs.");
    }
}

diagnose();
