const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config({ path: 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log('--- Phase 1/2: VERITAS Schema Baseline RE-CAPTURE ---');

    const { data: rows, error } = await supabase.rpc('exec_sql', {
        query: "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public'"
    });

    if (error) {
        console.error('❌ Error fetching schema:', error.message);
        return;
    }

    if (!rows || !Array.isArray(rows)) {
        console.warn('⚠️ No rows returned or unexpected format.');
        return;
    }

    console.log(`Fetched ${rows.length} column definitions.`);

    const tableGroups = {};
    rows.forEach(item => {
        if (!tableGroups[item.table_name]) tableGroups[item.table_name] = [];
        tableGroups[item.table_name].push(item);
    });

    const baselineEntries = [];
    for (const [tableName, columns] of Object.entries(tableGroups)) {
        const sortedCols = columns.sort((a, b) => a.column_name.localeCompare(b.column_name));
        const schemaString = JSON.stringify(sortedCols);
        const hash = crypto.createHash('sha256').update(schemaString).digest('hex');

        sortedCols.forEach(col => {
            baselineEntries.push({
                table_name: col.table_name,
                column_name: col.column_name,
                data_type: col.data_type,
                schema_hash: hash
            });
        });
    }

    console.log(`Total entries to insert: ${baselineEntries.length} across ${Object.keys(tableGroups).length} tables.`);

    const chunkSize = 50; // Smaller chunk size for reliability
    for (let i = 0; i < baselineEntries.length; i += chunkSize) {
        const chunk = baselineEntries.slice(i, i + chunkSize);
        const { error: insertError } = await supabase
            .from('supabase_schema_baseline')
            .upsert(chunk, { onConflict: 'table_name, column_name' });

        if (insertError) {
            console.error(`❌ Chunk ${i / chunkSize} failed:`, insertError.message);
        } else {
            if ((i / chunkSize) % 10 === 0) console.log(`Progress: ${i}/${baselineEntries.length} entries processed.`);
        }
    }

    console.log('✅ VERITAS Schema Baseline Re-Capture Complete.');
}

run();
