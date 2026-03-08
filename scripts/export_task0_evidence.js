
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    // 1. List all public tables
    const { data: tables, error: tableError } = await supabase.rpc('exec_sql', {
        query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    });

    if (tableError) {
        console.error('Error fetching tables:', tableError.message);
        return;
    }

    console.log('Public Tables:', tables.map(t => t.table_name));

    // 2. Export retrieval_logs (or closest match)
    const targetTable = tables.find(t => t.table_name.includes('retrieval_log'))?.table_name || 'retrieval_logs';
    console.log(`Exporting table: ${targetTable}`);

    const { data: logs, error: logError } = await supabase.from(targetTable).select('*');

    if (logError) {
        console.error(`Error fetching ${targetTable}:`, logError.message);
        return;
    }

    if (!logs || logs.length === 0) {
        console.log(`Table ${targetTable} is empty. Exporting header only.`);
        // To get columns if table is empty, we need another SQL query
        const { data: cols } = await supabase.rpc('exec_sql', {
            query: `SELECT column_name FROM information_schema.columns WHERE table_name = '${targetTable}'`
        });
        const headers = cols.map(c => c.column_name).join(',');
        writeCsv(targetTable, headers + '\n');
    } else {
        const headers = Object.keys(logs[0]).join(',');
        const rows = logs.map(r => Object.values(r).map(v => {
            if (v === null) return '';
            if (typeof v === 'object') return JSON.stringify(v).replace(/,/g, ';');
            return v;
        }).join(',')).join('\n');
        writeCsv(targetTable, headers + '\n' + rows);
    }
}

function writeCsv(name, content) {
    const dir = 'patent-evidence';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    fs.writeFileSync(`${dir}/${name}.csv`, content);
    console.log(`Exported ${name}.csv successfully.`);
}

main();
