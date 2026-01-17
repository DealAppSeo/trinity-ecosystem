import { supabase } from '../lib/supabase';

async function checkTaskColumns() {
    const { data, error } = await supabase.rpc('exec_sql', {
        query: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'trinity_tasks'"
    });
    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}

checkTaskColumns();
