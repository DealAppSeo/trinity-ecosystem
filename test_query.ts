import { supabaseAdmin } from './lib/supabase';

async function testQuery() {
    const { data, error } = await supabaseAdmin
        .from('trinity_tasks')
        .select('id, title')
        .in('status', ['pending', 'todo', 'pending_clarification'])
        .is('claimed_by', null)
        .or(`metadata->retry_after.is.null,metadata->retry_after.lte.${new Date().toISOString()}`)
        .limit(1)
        .maybeSingle();

    console.log("Original Query Result:", { data, error });

    const { data: fixData, error: fixError } = await supabaseAdmin
        .from('trinity_tasks')
        .select('id, title')
        .in('status', ['pending', 'todo', 'pending_clarification'])
        .is('claimed_by', null)
        .or(`metadata->>retry_after.is.null,metadata->>retry_after.lte.${new Date().toISOString()}`)
        .limit(1)
        .maybeSingle();

    console.log("Fixed Query Result:", { data: fixData, error: fixError });
}

testQuery();
