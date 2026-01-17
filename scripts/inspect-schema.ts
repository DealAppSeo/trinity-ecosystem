import { supabase } from '../lib/supabase';

async function inspect() {
    console.log("--- TRINITY_TASKS SCHEMA ---");
    const { data: cols, error } = await supabase.rpc('exec_sql', {
        query: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'trinity_tasks' ORDER BY ordinal_position"
    });

    if (error) {
        console.error("Error fetching schema:", error);
    } else {
        console.table(cols);
    }
}

inspect();
