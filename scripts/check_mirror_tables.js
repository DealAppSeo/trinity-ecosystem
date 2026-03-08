
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://oqufntblbuoeuhxqbspe.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY_MIRROR || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xdWZudGJsYnVvZXVoeHFic3BlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkTables() {
    const tables = ['sprint_updates', 'compute_bids', 'retrieval_logs'];

    for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (error) {
            console.log(`Table ${table}: ERROR - ${error.message}`);
        } else {
            console.log(`Table ${table}: EXISTS (${data.length} rows)`);
        }
    }
}

checkTables();
