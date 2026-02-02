const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Using URL:', supabaseUrl ? 'FOUND' : 'MISSING');
console.log('Using Key:', supabaseKey ? 'FOUND' : 'MISSING');

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function drainClarify() {
    console.log('🌊 Starting Clarify Column Drain...');

    // 1. Identify tasks stuck in pending_clarification that are investigative/recursive
    const { data: stuckTasks, error } = await supabase
        .from('trinity_tasks')
        .select('id, title, status')
        .eq('status', 'pending_clarification');

    if (error) {
        console.error('Error fetching tasks:', error);
        return;
    }

    console.log(`Found ${stuckTasks.length} tasks in Clarify column.`);

    const toArchive = stuckTasks.filter(t =>
        t.title.includes('[ANTIFRAGILE]') ||
        t.title.includes('[HEALING]') ||
        t.title.includes('[WAKE]') ||
        t.title.includes('Investigate repeated failure')
    );

    console.log(`Identified ${toArchive.length} recursive/junk tasks for archiving.`);

    if (toArchive.length > 0) {
        const ids = toArchive.map(t => t.id);

        // Update to 'failed' (or archive if you have an archive status, here we use failed to stop them)
        const { error: updateError } = await supabase
            .from('trinity_tasks')
            .update({
                status: 'failed',
                result: '[DRAIN] Automatically archived to prevent recursive swarm stall.'
            })
            .in('id', ids);

        if (updateError) {
            console.error('Error updating tasks:', updateError);
        } else {
            console.log('Successfully drained recursive tasks.');
        }
    } else {
        console.log('No recursive tasks found to drain.');
    }
}

drainClarify();
