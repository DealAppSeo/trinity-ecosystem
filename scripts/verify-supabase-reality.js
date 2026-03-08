const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function verifyReality() {
    console.log('--- SUPABASE REALITY AUDIT ---');

    // 1. Check Partitioning
    const { data: partitionData, error: pError } = await supabase.rpc('exec_sql', {
        query: "SELECT tablename, partition_expression FROM pg_partitions WHERE schemaname = 'public' AND tablename LIKE 'agent_artifacts%';"
    });
    console.log('1. Partitioning (agent_artifacts):', pError ? 'FAIL: ' + pError.message : (partitionData?.length > 0 ? 'PARTITIONED' : 'NOT PARTITIONED (Checking base table...)'));
    if (!partitionData || partitionData.length === 0) {
        const { data: tableData } = await supabase.rpc('exec_sql', {
            query: "SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'p' AND c.relname = 'agent_artifacts';"
        });
        console.log('   Base Table Kind:', tableData?.length > 0 ? 'PARTITIONED PARENT' : 'REGULAR TABLE');
    }

    // 2. Check Compute Bids
    const { count, error: bError } = await supabase.from('compute_bids').select('*', { count: 'exact', head: true });
    console.log('2. Bidding (compute_bids) Row Count:', bError ? 'FAIL: ' + bError.message : count);

    // 3. Check HotStuff Proposals
    const { data: proposals, error: prError } = await supabase.from('schema_change_proposals').select('id, status, current_phase').limit(5);
    console.log('3. Governance (schema_change_proposals):', prError ? 'FAIL: ' + prError.message : (proposals?.length > 0 ? `FOUND ${proposals.length} PROJECTS` : 'EMPTY'));

    // 4. Check Identity Registry
    const { data: identityTable, error: iError } = await supabase.rpc('exec_sql', {
        query: "SELECT tablename FROM pg_tables WHERE tablename = 'erc8004_agent_registry';"
    });
    console.log('4. Identity Registry Table:', iError ? 'FAIL' : (identityTable?.length > 0 ? 'EXISTS' : 'NOT CREATED'));
}

verifyReality();
