const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function getWallets() {
    const { data, error } = await supabase
        .from('trinity_agent_registry')
        .select('agent_name, wallet_address');

    if (error) {
        console.error("❌ Error fetching wallets:", error.message);
        return;
    }

    console.log(JSON.stringify(data, null, 2));
}

getWallets();
