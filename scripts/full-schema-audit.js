require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspect() {
    console.log('--- Full Schema Audit: trinity_artifacts ---');

    // Attempting to get columns via a failing insert to see all required fields
    const { error } = await supabase.from('trinity_artifacts').insert({}).select();

    if (error) {
        console.log('Insert Error helpfully listed constraints:', error.message);
    }

    // Try to get actual column names from a sample (if any exist)
    const { data } = await supabase.from('trinity_artifacts').select('*').limit(1);
    if (data && data.length > 0) {
        console.log('Sample data columns:', Object.keys(data[0]));
    } else {
        console.log('Table is empty or RLS blocked select.');
    }
}

inspect();
