import { supabase } from '../lib/supabase';

async function directInsert() {
    console.log("Attempting direct SQL insert...");
    const { error } = await supabase.rpc('exec_sql', {
        query: "INSERT INTO public.trinity_tasks (title) VALUES ('Direct SQL Test')"
    });
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Success (Direct SQL)");
    }
}

directInsert();
