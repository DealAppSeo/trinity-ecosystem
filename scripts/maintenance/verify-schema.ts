
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verify() {
    console.log('Checking for trinity_artifacts table...');
    const { data, error } = await supabase
        .from('trinity_artifacts')
        .select('count', { count: 'exact', head: true });

    if (error) {
        console.error('Error checking trinity_artifacts:', error.message);
        // If error, try to list all tables (requires specific permissions usually not available, but we can try to insert/select known tables)
        console.log('Attempting to guess other table names...');
    } else {
        console.log(`Found trinity_artifacts table with ${data} entries (head check). count result:`, data);

        // Let's see one row to understand schema
        const { data: rows, error: rowError } = await supabase
            .from('trinity_artifacts')
            .select('*')
            .limit(1);

        if (rows && rows.length > 0) {
            console.log('Sample row keys:', Object.keys(rows[0]));
            console.log('Sample row:', rows[0]);
        } else {
            console.log('Table exists but is empty.');
        }
    }
}

verify();
