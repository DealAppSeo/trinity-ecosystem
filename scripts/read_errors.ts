import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function readErrors() {
    console.log('🕵️ Fetching Runtime Errors...');

    const { data: errors, error } = await supabase
        .from('trinity_runtime_errors')
        .select('*')
        .limit(5);

    if (error) {
        console.error('❌ Failed to fetch errors:', error);
        return;
    }

    if (!errors || errors.length === 0) {
        console.log('✅ No runtime errors found (or table empty).');
        return;
    }

    console.log(`Found ${errors.length} recent errors:`);
    errors.forEach((err, i) => {
        console.log(`\n--- [Error ${i + 1}] ---`);
        console.log(`Message: ${err.error_message}`);
        console.log(`File:    ${err.file_path || 'Unknown'}`);
        console.log(`Line:    ${err.line_number || '?'}`);
        console.log(`Stack:   ${err.stack_trace ? err.stack_trace.substring(0, 300) + '...' : 'No stack trace'}`);
        console.log(`Time:    ${new Date(err.created_at).toLocaleString()}`);
    });
}

readErrors();
