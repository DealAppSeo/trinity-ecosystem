
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debug() {
    console.log('--- 👤 AGENT STATUS CHECK ---');
    const agentsToCheck = ['trinity-chesed', 'trinity-nexus', 'trinity-sophia', 'trinity-torch', 'trinity-veritas'];
    const { data: agents, error: aErr } = await supabase
        .from('trinity_agent_registry')
        .select('agent_name, status, last_active, reputation_score')
        .in('agent_name', agentsToCheck);

    if (aErr) console.error('Agent Error:', aErr.message);
    else console.table(agents);

    console.log('\n--- 📋 TABLE NAME VERIFICATION ---');
    const { data: tables, error: tErr } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .in('table_name', ['execution_log', 'trade_execution_log']);

    if (tErr) console.error('Table Error:', tErr.message);
    else console.table(tables);

    console.log('\n--- 🏗️ COLUMN VERIFICATION (prediction_signals) ---');
    const { data: columns, error: cErr } = await supabase
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_name', 'prediction_signals')
        .eq('table_schema', 'public');

    if (cErr) console.error('Column Error:', cErr.message);
    else console.log('Columns:', columns?.map((c: any) => c.column_name));
}

debug();
