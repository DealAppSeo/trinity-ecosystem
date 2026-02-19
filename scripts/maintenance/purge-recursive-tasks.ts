import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load ENV
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function purgeRecursiveTasks() {
    console.log('🚀 PURGE INITIATED: Cleaning up recursive Veritas tasks...');

    // 1. Identify tasks with nested Titles
    const { data: tasks, error } = await supabase
        .from('trinity_tasks')
        .select('id, title')
        .ilike('title', '%Verify Artifact%');

    if (error) {
        console.error('❌ Failed to fetch tasks:', error.message);
        return;
    }

    if (!tasks || tasks.length === 0) {
        console.log('✅ No recursive verification tasks found.');
        return;
    }

    console.log(`🔍 Found ${tasks.length} tasks matching "Verify Artifact".`);

    const idsToDelete = tasks.map(t => t.id);

    // 2. Delete them
    const { error: deleteError } = await supabase
        .from('trinity_tasks')
        .delete()
        .in('id', idsToDelete);

    if (deleteError) {
        console.error('❌ Failed to delete tasks:', deleteError.message);
    } else {
        console.log(`🚮 Successfully purged ${idsToDelete.length} loop tasks.`);
    }
}

purgeRecursiveTasks().catch(console.error);
