const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
    'https://qnnpjhlxljtqyigedwkb.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTkzOTU5MSwiZXhwIjoyMDY3NTE1NTkxfQ.4ADAiDK-CD6Jk5_JgizadriWVBoYg42NnsKsbcQ0h6A'
);

const EXPORT_DIR = path.join(__dirname, '..', 'patent-evidence');
const TABLES = ['retrieval_logs', 'compute_bids', 'db_routing_decisions', 'payment_log', 'agent_repid_history', 'agent_registry', 'recall_decisions', 'erc8004_feedback_log', 'validation_registry_log'];

async function exportTable(tableName) {
    console.log(`Exporting ${tableName}...`);
    const { data, error } = await supabase.from(tableName).select('*');

    if (error) {
        console.error(`Error fetching ${tableName}:`, error);
        return;
    }

    if (!data || data.length === 0) {
        console.log(`No data found for ${tableName}.`);
        return;
    }

    const keys = Object.keys(data[0]);
    const csvContent = [
        keys.join(','),
        ...data.map(row => keys.map(key => {
            const val = row[key];
            if (val === null || val === undefined) return '';
            if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
            if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
                return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        }).join(','))
    ].join('\n');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${tableName}_${timestamp}.csv`;
    const filePath = path.join(EXPORT_DIR, filename);

    fs.writeFileSync(filePath, csvContent);
    console.log(`Successfully exported ${tableName} to ${filename}`);
}

async function main() {
    if (!fs.existsSync(EXPORT_DIR)) {
        fs.mkdirSync(EXPORT_DIR);
    }

    for (const table of TABLES) {
        await exportTable(table);
    }
}

main().catch(console.error);
