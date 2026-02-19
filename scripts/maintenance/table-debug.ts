import { supabase } from '../lib/supabase';

async function tasksColumnDebug() {
    console.log("Setting up debug table...");
    await supabase.rpc('exec_sql', {
        query: "CREATE TABLE IF NOT EXISTS public.debug_log (id serial primary key, msg text, created_at timestamp with time zone default now())"
    });
    await supabase.rpc('exec_sql', { query: "TRUNCATE public.debug_log" });

    console.log("Capturing columns...");
    await supabase.rpc('exec_sql', {
        query: "INSERT INTO public.debug_log (msg) SELECT 'Col: ' || column_name || ' (' || data_type || ')' FROM information_schema.columns WHERE table_name = 'trinity_tasks'"
    });

    console.log("Reading results...");
    const { data, error } = await supabase.from('debug_log').select('*').order('created_at', { ascending: false });
    if (error) {
        console.error("Error reading log:", error);
    } else {
        data.forEach(d => console.log(d.msg));
    }
}

tasksColumnDebug();
