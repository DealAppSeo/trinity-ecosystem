const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTable() {
    console.log('--- TABLE SCHEMA CHECK ---');
    const { data: cols, error: errCols } = await supabase.rpc('get_table_columns', { table_name: 'agent_artifacts' });
    if (errCols) {
        console.error('Error fetching columns:', errCols.message);
        // Fallback: Just get one row to see keys
        const { data: row } = await supabase.from('agent_artifacts').select('*').limit(1);
        if (row && row.length > 0) console.log('Columns (from row):', Object.keys(row[0]));
    } else {
        console.log('Columns:', cols);
    }

    const { count, error: errCount } = await supabase.from('agent_artifacts').select('*', { count: 'exact', head: true });
    console.log('Row Count:', count);
}

checkTable();
