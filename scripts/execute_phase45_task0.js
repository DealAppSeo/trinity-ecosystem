
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const EXPORT_DIR = path.join(__dirname, '..', 'patent-evidence');

async function logToSprintUpdates(taskName, evidenceDescription, status) {
    console.log(`Logging to sprint_updates: ${taskName}...`);
    const { error } = await supabase.from('sprint_updates').insert({
        task_name: taskName,
        evidence_description: evidenceDescription,
        status: status,
        timestamp: new Date().toISOString()
    });
    if (error) {
        console.error('Error logging to sprint_updates:', error.message);
    }
}

async function exportTable(tableName) {
    console.log(`Exporting ${tableName}...`);
    const { data, error } = await supabase.from(tableName).select('*');

    if (error) {
        console.error(`Error fetching ${tableName}:`, error.message);
        return false;
    }

    if (!data || data.length === 0) {
        console.log(`No data found for ${tableName}.`);
        return true;
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

    if (!fs.existsSync(EXPORT_DIR)) {
        fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }

    fs.writeFileSync(filePath, csvContent);
    console.log(`Successfully exported ${tableName} to ${filename}`);
    return filename;
}

async function main() {
    console.log('--- Phase 4.5 Task 0 Execution ---');

    // 1. Create sprint_updates table if not exists
    console.log('Step 1: Ensuring sprint_updates table exists...');
    const createTableSql = `
        CREATE TABLE IF NOT EXISTS public.sprint_updates (
            id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
            task_name TEXT NOT NULL,
            evidence_description TEXT,
            timestamp TIMESTAMPTZ DEFAULT NOW(),
            status TEXT
        );
        ALTER TABLE public.sprint_updates ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Enable all access for anon/service_role" ON public.sprint_updates FOR ALL USING (true) WITH CHECK (true);
    `;
    const { data: q1Data, error: q1Error } = await supabase.rpc('exec_sql', { query: createTableSql });
    if (q1Error) {
        console.error('Error creating sprint_updates:', q1Error.message);
    } else {
        console.log('sprint_updates table ready.');
    }

    // 2. Add agent_repid_score column to compute_bids
    console.log('Step 2: Adding agent_repid_score to compute_bids...');
    const alterTableSql = `
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='compute_bids' AND column_name='agent_repid_score') THEN
                ALTER TABLE public.compute_bids ADD COLUMN agent_repid_score NUMERIC;
            END IF;
        END $$;
    `;
    const { data: q2Data, error: q2Error } = await supabase.rpc('exec_sql', { query: alterTableSql });
    if (q2Error) {
        console.error('Error altering compute_bids:', q2Error.message);
    } else {
        console.log('compute_bids column agent_repid_score ready.');
        await logToSprintUpdates('Task 0: Database Schema Update', 'Added agent_repid_score column to compute_bids table.', 'completed');
    }

    // 3. Export retrieval_logs table to CSV
    console.log('Step 3: Exporting retrieval_logs...');
    const csvFilename = await exportTable('retrieval_logs');
    if (csvFilename) {
        await logToSprintUpdates('Task 0: Export retrieval_logs', `Exported retrieval_logs to ${csvFilename} in /patent-evidence/`, 'completed');
    }

    console.log('--- Task 0 Execution Complete ---');
}

main().catch(console.error);
