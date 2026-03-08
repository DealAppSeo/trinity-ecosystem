const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function setup() {
    const sql = "ALTER TABLE public.trinity_agent_registry ADD COLUMN IF NOT EXISTS drift_test_col TEXT;";
    const { data, error } = await supabase.rpc('exec_sql', { query: sql });
    if (error) console.error('❌ Error:', error.message);
    else console.log('✅ Dummy column added for drift test:', data);
}

setup();
