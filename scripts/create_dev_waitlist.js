const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://qnnpjhlxljtqyigedwkb.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTkzOTU5MSwiZXhwIjoyMDY3NTE1NTkxfQ.4ADAiDK-CD6Jk5_JgizadriWVBoYg42NnsKsbcQ0h6A'
);

async function createTable() {
    const sql = `
    CREATE TABLE IF NOT EXISTS developer_waitlist (
      id BIGSERIAL PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE NOT NULL,
      github_handle TEXT,
      linkedin_url TEXT,
      role_type TEXT CHECK (role_type IN ('backend','security','ml','web3','founder','other')),
      why_interested TEXT,
      repid_seed NUMERIC(8,2) DEFAULT 0,
      spot_number INTEGER,
      status TEXT CHECK (status IN ('pending','approved','onboarded')) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

    // Trying with 'query' instead of 'sql_query' based on previous error hint
    const { error } = await supabase.rpc('exec_sql', { query: sql });

    if (error) {
        console.error('Error creating table:', error);
    } else {
        console.log('developer_waitlist table created successfully.');
    }
}

createTable();
