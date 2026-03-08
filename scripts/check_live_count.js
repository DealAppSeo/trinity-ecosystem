const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkLiveCount() {
    const { data, error } = await supabase.rpc('exec_sql', {
        query: "SELECT table_name FROM information_schema.columns WHERE table_schema = 'public'"
    });

    if (error) {
        console.error('❌ Error:', error.message);
        return;
    }

    const uniqueTables = [...new Set(data.map(r => r.table_name))];
    console.log('Live Table Count (Public):', uniqueTables.length);
    console.log('Live Column Count (Public):', data.length);
}

checkLiveCount();
