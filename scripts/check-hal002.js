const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
async function main() {
    const { data } = await s.from('trinity_tasks').select('title, belief, disbelief, result').ilike('title', '%HAL-002%').order('updated_at', { ascending: false }).limit(1).single();
    console.log(JSON.stringify(data, null, 2));
}
main();
