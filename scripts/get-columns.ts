
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;

async function getColumnNames() {
    console.log('--- 📊 VERIFYING ACTUAL COLUMN NAMES ---');
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const tables = [
        'prediction_regimes',
        'prediction_signals',
        'prediction_consensus',
        'agent_accuracy_matrix',
        'anfis_weight_history',
        'trade_execution_log',
        'execution_log',
        'hitl_hunch_log',
        'human_intuition_scores',
        'influencer_rep_scores'
    ];

    for (const table of tables) {
        process.stdout.write(`Checking ${table}... `);
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (error) {
            console.log(`❌ ${error.message}`);
        } else {
            const columns = data.length > 0 ? Object.keys(data[0]) : [];
            // If empty, try to just get names by other means - wait, Select * with limit 1 should return keys even if zero rows?
            // Actually in JS client, if 0 rows, it returns empty array.
            // Let's try to find a system view.
            if (data.length === 0) {
                const { data: cols, error: cErr } = await supabase
                    .from('information_schema.columns')
                    .select('column_name')
                    .eq('table_name', table);
                if (cErr) console.log(`Empty and schema check failed.`);
                else console.log(`✅ [${cols.map((c: any) => c.column_name).join(', ')}]`);
            } else {
                console.log(`✅ [${columns.join(', ')}]`);
            }
        }
    }
}

getColumnNames();
