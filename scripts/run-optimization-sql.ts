import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runOptimization() {
    console.log('🚀 Running Supabase Optimizations...');
    const sql = `
    -- Core task status indexing for pickup
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON trinity_tasks (status);

    -- Priority-based sorting optimization
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON trinity_tasks (priority DESC);

    -- Claim logic optimization
    CREATE INDEX IF NOT EXISTS idx_tasks_claimed_by ON trinity_tasks (claimed_by);

    -- Provenance and Verification optimization
    CREATE INDEX IF NOT EXISTS idx_tasks_verified_by ON trinity_tasks (verified_by);

    -- Loop detection / Veritas loop optimization
    CREATE INDEX IF NOT EXISTS idx_tasks_title_veritas ON trinity_tasks (title) WHERE title LIKE '%[VERIFY]%';

    -- Completed tasks analysis
    CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON trinity_tasks (completed_at ASC);
    
    -- Veritas specific index for loops
    CREATE INDEX IF NOT EXISTS idx_tasks_veritas_loops ON trinity_tasks (title) WHERE title LIKE '%[VERITAS]%';
  `;

    // We try exec_sql RPC if available
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
        console.error('❌ RPC exec_sql failed:', error.message);
        console.log('\n--- PLEASE RUN THIS SQL MANUALLY IN SUPABASE SQL EDITOR ---\n');
        console.log(sql);
        console.log('\n-----------------------------------------------------------\n');
    } else {
        console.log('✅ Supabase indexes successfully created.');
    }
}

runOptimization();
