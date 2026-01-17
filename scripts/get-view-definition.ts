import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load env from project root
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function getViewDef() {
    console.log('Attempting to fetch definition for v_ready_tasks...');

    // We can try to use the query builder to read from information_schema if enabled
    const { data, error } = await supabase
        .from('information_schema.views' as any)
        .select('view_definition')
        .eq('table_name', 'v_ready_tasks')
        .maybeSingle();

    if (error) {
        console.error('Failed to fetch view definition:', error.message);
        console.log('You may need to manually save the definition of v_ready_tasks before dropping it.');
    } else if (data) {
        console.log('--- VIEW DEFINITION FOUND ---');
        console.log(data.view_definition);
        console.log('------------------------------');
    } else {
        console.log('View v_ready_tasks not found or access denied.');
    }
}

getViewDef();
