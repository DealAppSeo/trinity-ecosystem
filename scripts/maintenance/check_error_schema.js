
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: './.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'trinity_runtime_errors' });

    if (error) {
        // If RPC doesn't exist, try a simple select
        console.log("RPC get_table_columns failed, trying select * limit 1");
        const { data: selectData, error: selectError } = await supabase.from('trinity_runtime_errors').select('*').limit(1);
        if (selectError) {
            console.error("Select failed:", selectError);
        } else {
            console.log("Columns:", Object.keys(selectData[0] || {}));
        }
    } else {
        console.log("Columns:", data);
    }
}

checkSchema();
