
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function runSchemaQuery() {
    console.log('--- 🔍 RUNNING SCHEMA QUERY (Step 2) ---');
    const { data, error } = await supabase.rpc('run_sql', {
        sql: `
            SELECT table_name, column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name IN (
              'prediction_regimes',
              'prediction_signals', 
              'prediction_consensus',
              'agent_accuracy_matrix',
              'anfis_weight_history',
              'trade_execution_log',
              'hitl_hunch_log',
              'human_intuition_scores',
              'influencer_rep_scores'
            )
            ORDER BY table_name, ordinal_position;
        `
    });

    if (error) {
        // If RPC isn't available, we might need another way.
        // Let's try to just select from information_schema if possible? 
        // Usually Supabase doesn't allow direct SELECT on information_schema via API unless RPC is set up.
        console.error('❌ RPC Error:', error.message);
        console.log('Attempting alternative retrieval...');

        // Alternative: just list some columns from the tables directly
        const tables = [
            'prediction_regimes',
            'prediction_signals',
            'prediction_consensus',
            'trade_execution_log',
            'hitl_hunch_log'
        ];

        for (const table of tables) {
            console.log(`Checking table: ${table}`);
            const { data: cols, error: colErr } = await supabase.from(table).select('*').limit(1);
            if (colErr) console.error(`  Error: ${colErr.message}`);
            else if (cols && cols.length > 0) console.log(`  Columns found: ${Object.keys(cols[0]).join(', ')}`);
            else console.log(`  Table empty or inaccessible.`);
        }
    } else {
        console.table(data);
    }
}

runSchemaQuery();
