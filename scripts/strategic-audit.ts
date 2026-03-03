import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function runAudit() {
    console.log('--- 📋 PHASE 1: FULL TABLE INVENTORY ---');
    const { data: step1, error: err1 } = await supabase.rpc('execute_sql', {
        sql_query: `
      SELECT table_name,
             pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) AS size,
             (SELECT COUNT(*) FROM information_schema.columns c
              WHERE c.table_name = t.table_name) AS column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public'
      ORDER BY pg_total_relation_size(quote_ident(table_name)) DESC;
    `
    });
    if (err1) console.error('Step 1 Error:', err1.message);
    else console.log(JSON.stringify(step1, null, 2));

    console.log('\n--- 📈 PHASE 1: ACTIVITY REPORT (TOP 20) ---');
    const { data: step2, error: err2 } = await supabase.rpc('execute_sql', {
        sql_query: `
      SELECT schemaname, tablename, n_live_tup AS estimated_rows,
             last_analyze, last_autoanalyze
      FROM pg_stat_user_tables
      ORDER BY n_live_tup DESC
      LIMIT 20;
    `
    });
    if (err2) console.error('Step 2 Error:', err2.message);
    else console.table(step2);

    console.log('\n--- ✍️ PHASE 1: RECENT WRITE ACTIVITY (30 DAYS) ---');
    const { data: step3, error: err3 } = await supabase.rpc('execute_sql', {
        sql_query: `
      SELECT tablename, n_tup_ins AS inserts, n_tup_upd AS updates,
             n_tup_del AS deletes, last_autoanalyze
      FROM pg_stat_user_tables
      WHERE last_autoanalyze > NOW() - INTERVAL '30 days'
      ORDER BY n_tup_ins DESC;
    `
    });
    if (err3) console.error('Step 3 Error:', err3.message);
    else console.table(step3);
}

runAudit();
