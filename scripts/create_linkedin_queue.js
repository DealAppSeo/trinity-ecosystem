const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://qnnpjhlxljtqyigedwkb.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTkzOTU5MSwiZXhwIjoyMDY3NTE1NTkxfQ.4ADAiDK-CD6Jk5_JgizadriWVBoYg42NnsKsbcQ0h6A'
);

async function createTable() {
    const sql = `
    CREATE TABLE IF NOT EXISTS linkedin_content_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ DEFAULT now(),
      agent TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      scheduled_for TIMESTAMPTZ,
      status TEXT DEFAULT 'awaiting_review',
      rep_id INTEGER,
      tier INTEGER,
      latency INTEGER,
      cost NUMERIC,
      dag_depth INTEGER,
      nodes JSONB DEFAULT '[]'::jsonb,
      metadata JSONB DEFAULT '{}'::jsonb
    );
  `;

    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
        // If exec_sql RPC doesn't exist, we might need a different approach or assume the table creation via dashboard if unavailable.
        // However, usually we have a way to run SQL.
        console.error('Error creating table:', error);

        // Attempting a direct insert to see if table exists
        const { error: insertError } = await supabase.from('linkedin_content_queue').select('id').limit(1);
        if (insertError && insertError.code === '42P01') {
            console.log('Table does not exist and exec_sql failed. Please create linkedin_content_queue table manually in Supabase dashboard.');
        } else {
            console.log('Table exists or was created.');
        }
    } else {
        console.log('Table created successfully via exec_sql.');
    }
}

createTable();
