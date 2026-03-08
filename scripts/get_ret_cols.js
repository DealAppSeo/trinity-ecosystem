
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getCols() {
    const { data, error } = await supabase.from('retrieval_logs').select('*').limit(1);
    if (error) {
        console.error(error);
    } else {
        const cols = data.length > 0 ? Object.keys(data[0]) : [];
        if (cols.length === 0) {
            // Try information_schema
            const q = "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'retrieval_logs' ORDER BY ordinal_position";
            const { data: qData, error: qError } = await supabase.rpc('exec_sql', { query: q });
            if (qError) {
                console.error(qError);
            } else {
                console.log('Columns:', qData.map(c => c.column_name).join(', '));
            }
        } else {
            console.log('Columns:', cols.join(', '));
        }
    }
}

getCols().catch(console.error);
