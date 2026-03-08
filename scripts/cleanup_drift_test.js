const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function cleanup() {
    const sql = `
        ALTER TABLE public.trinity_agent_registry 
        DROP COLUMN IF EXISTS drift_test_col,
        DROP COLUMN IF EXISTS col1, 
        DROP COLUMN IF EXISTS col2, 
        DROP COLUMN IF EXISTS col3, 
        DROP COLUMN IF EXISTS col4, 
        DROP COLUMN IF EXISTS col5, 
        DROP COLUMN IF EXISTS col6, 
        DROP COLUMN IF EXISTS col7, 
        DROP COLUMN IF EXISTS col8, 
        DROP COLUMN IF EXISTS col9, 
        DROP COLUMN IF EXISTS col10, 
        DROP COLUMN IF EXISTS col11, 
        DROP COLUMN IF EXISTS col12, 
        DROP COLUMN IF EXISTS col13, 
        DROP COLUMN IF EXISTS col14, 
        DROP COLUMN IF EXISTS col15;
    `;
    const { data, error } = await supabase.rpc('exec_sql', { query: sql });
    if (error) console.error('❌ Error:', error.message);
    else console.log('✅ Drift test columns removed.');
}

cleanup();
