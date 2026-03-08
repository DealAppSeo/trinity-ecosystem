const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function createTable() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const sql = `
    CREATE TABLE IF NOT EXISTS public.trinity_hitl_decisions (
      id BIGSERIAL PRIMARY KEY,
      task_id BIGINT REFERENCES trinity_tasks(id),
      agent_id TEXT NOT NULL,
      agent_repid TEXT NOT NULL,
      mission_summary TEXT NOT NULL,
      confidence_score NUMERIC(4,3),
      s_pi_score NUMERIC(8,4),
      escalation_reason TEXT NOT NULL,
      signature TEXT NOT NULL,
      telegram_message_id BIGINT,
      decision TEXT CHECK (decision IN ('APPROVED', 'ESCALATED', 'PENDING')),
      decided_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_hitl_pending ON trinity_hitl_decisions(decision) WHERE decision = 'PENDING';
    CREATE INDEX IF NOT EXISTS idx_hitl_task ON trinity_hitl_decisions(task_id);
    `;

    console.log('Creating trinity_hitl_decisions table...');
    const { error } = await supabase.rpc('exec_sql', { query: sql });

    if (error) {
        console.error('Error creating table:', error.message);
    } else {
        console.log('Table trinity_hitl_decisions created successfully.');
    }
}

createTable();
