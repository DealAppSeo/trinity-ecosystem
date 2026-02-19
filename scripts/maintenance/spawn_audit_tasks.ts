import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

// ============================================
// SYSTEM AUDIT SPAWNER
// ============================================
// Creates "System Audit" tasks for agents to review performance.
// Specifically targets: Trinity-Veritas (Truth) and Trinity-Mel (Care).

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function spawnAuditTasks() {
    console.log("🕵️ Starting System Audit Spawn...");

    // 1. Check Bid Volume
    const { count: bidCount } = await supabase
        .from('trinity_bids')
        .select('*', { count: 'exact', head: true });

    // 2. Check Mock Call Volume (Errors)
    // Using runtime_errors table if mock table not high volume yet
    const { count: errorCount } = await supabase
        .from('trinity_runtime_errors')
        .select('*', { count: 'exact', head: true });

    console.log(`📊 Stats: ${bidCount} Bids, ${errorCount} Errors.`);

    // 3. Spawn Veritas Audit (Truth/Performance)
    // Only if not already pending
    const { data: existingVeritas } = await supabase
        .from('trinity_tasks')
        .select('*')
        .eq('status', 'pending')
        .eq('assigned_to', 'trinity-veritas')
        .ilike('title', '%Audit Bidding%');

    if (!existingVeritas || existingVeritas.length === 0) {
        await supabase.from('trinity_tasks').insert({
            title: `[AUDIT] Review Bidding Performance (N=${bidCount})`,
            description: `[SYSTEM_AUDIT]\n1. READ 'trinity_bids' table.\n2. ANALYZE winner distribution.\n3. REPORT anomalies or inefficiencies in a markdown file.\n4. SUGGEST improvements to 'lib/anfis-bid-resolver.ts'.`,
            task_type: 'system_audit',
            assigned_to: 'trinity-veritas',
            priority: 85,
            status: 'pending' // Auction will verify assignments but Veritas is preferred
        });
        console.log("✅ Created 'Audit Bidding' task for Veritas.");
    }

    // 4. Spawn Mel Audit (Care/Healing)
    const { data: existingMel } = await supabase
        .from('trinity_tasks')
        .select('*')
        .eq('status', 'pending')
        .eq('assigned_to', 'trinity-mel')
        .ilike('title', '%Heal Runtime%');

    if (errorCount && errorCount > 0 && (!existingMel || existingMel.length === 0)) {
        await supabase.from('trinity_tasks').insert({
            title: `[HEAL] Analyze Runtime Errors (N=${errorCount})`,
            description: `[SYSTEM_AUDIT]\n1. READ 'trinity_runtime_errors'.\n2. IDENTIFY recurring patterns.\n3. PROPOSE code fixes for the root causes.\n4. WRITE patch suggestions to 'healer_report.md'.`,
            task_type: 'system_audit',
            assigned_to: 'trinity-mel',
            priority: 90,
            status: 'pending'
        });
        console.log("✅ Created 'Heal Errors' task for Mel.");
    }
}

spawnAuditTasks().catch(console.error);
