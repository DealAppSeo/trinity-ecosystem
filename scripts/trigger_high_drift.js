const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function setup() {
    const sql = `
        ALTER TABLE public.trinity_agent_registry 
        ADD COLUMN IF NOT EXISTS col1 TEXT, 
        ADD COLUMN IF NOT EXISTS col2 TEXT, 
        ADD COLUMN IF NOT EXISTS col3 TEXT, 
        ADD COLUMN IF NOT EXISTS col4 TEXT, 
        ADD COLUMN IF NOT EXISTS col5 TEXT, 
        ADD COLUMN IF NOT EXISTS col6 TEXT, 
        ADD COLUMN IF NOT EXISTS col7 TEXT, 
        ADD COLUMN IF NOT EXISTS col8 TEXT, 
        ADD COLUMN IF NOT EXISTS col9 TEXT, 
        ADD COLUMN IF NOT EXISTS col10 TEXT, 
        ADD COLUMN IF NOT EXISTS col11 TEXT, 
        ADD COLUMN IF NOT EXISTS col12 TEXT, 
        ADD COLUMN IF NOT EXISTS col13 TEXT, 
        ADD COLUMN IF NOT EXISTS col14 TEXT, 
        ADD COLUMN IF NOT EXISTS col15 TEXT;
    `;
    const { data, error } = await supabase.rpc('exec_sql', { query: sql });
    if (error) console.error('❌ Error:', error.message);
    else console.log('✅ HIGH Severity Drift Triggered:', data);
}

setup();
