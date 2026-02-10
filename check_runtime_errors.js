
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: './.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase env vars.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRuntimeErrors() {
    console.log("Fetching latest runtime errors...");

    const { data, error } = await supabase
        .from('trinity_runtime_errors')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(10);

    if (error) {
        console.error("Error fetching runtime errors:", error);
        return;
    }

    if (data.length === 0) {
        console.log("No runtime errors found.");
    } else {
        data.forEach(err => {
            console.log(`\n[${err.created_at}] ERROR: ${err.error_message}`);
            console.log(`File: ${err.file_path}:${err.line_number}`);
            if (err.stack_trace) console.log(`Stack: ${err.stack_trace.substring(0, 500)}...`);
        });
    }
}

checkRuntimeErrors();
