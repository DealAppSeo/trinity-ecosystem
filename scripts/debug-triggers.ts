import { supabase } from '../lib/supabase';

async function debugTriggers() {
    const query = `
        SELECT tgname, tgenabled, tgisinternal 
        FROM pg_trigger 
        WHERE tgrelid = 'public.trinity_tasks'::regclass
    `;
    console.log("Listing triggers...");
    const { data, error } = await supabase.rpc('exec_sql', { query });
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Triggers:", JSON.stringify(data, null, 2));
    }
}

debugTriggers();
