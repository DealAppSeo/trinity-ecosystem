import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectAssignments() {
    console.log("🔍 Detailed Task Assignment Inspection...");

    const { data: tasks, error } = await supabase
        .from('trinity_tasks')
        .select('id, status, assigned_to, claimed_by, title')
        .in('status', ['pending', 'doing', 'in_progress']);

    if (error) {
        console.error("Error:", error.message);
        return;
    }

    const pending = tasks?.filter(t => t.status === 'pending') || [];
    const active = tasks?.filter(t => t.status === 'doing' || t.status === 'in_progress') || [];

    console.log(`\n📊 PENDING TASKS (${pending.length}):`);
    const pendingAssignments: any = {};
    pending.slice(0, 10).forEach(t => {
        console.log(`- [${t.id}] ${t.title.substring(0, 30)}... | Assigned: ${t.assigned_to} | Claimed: ${t.claimed_by}`);
    });

    pending.forEach(t => {
        const key = t.assigned_to || 'unassigned';
        pendingAssignments[key] = (pendingAssignments[key] || 0) + 1;
    });
    console.log("   Summary of 'Assigned To' for Pending:", pendingAssignments);

    console.log(`\n📊 ACTIVE TASKS (${active.length}):`);
    active.forEach(t => {
        console.log(`- [${t.status}] ${t.title.substring(0, 30)}... | Assigned: ${t.assigned_to} | Claimed: ${t.claimed_by}`);
    });
}

inspectAssignments();
