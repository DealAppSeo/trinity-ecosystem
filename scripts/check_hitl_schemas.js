
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkSchema(tableName) {
    console.log(`--- Schema for ${tableName} ---`);
    const { data, error } = await supabase.rpc('exec_sql', {
        query: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName}'`
    });
    if (error) {
        console.error(`Error: ${error.message}`);
    } else {
        data.forEach(c => console.log(`${c.column_name}: ${c.data_type}`));
    }
}

async function main() {
    await checkSchema('trinity_hitl_decisions');
    await checkSchema('trinity_hitl_requests');
}

main();
