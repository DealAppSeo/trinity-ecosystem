import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
    console.log("🔍 Querying information_schema.columns for trinity_agent_logs...");

    // This requires service role but usually works if you have permissions or a helper RPC
    const { data, error } = await supabase.from('trinity_agent_logs').select().limit(0);
    // Wait, select() with limit(0) still returns metadata/header in some clients.

    // Better: let's try a raw SQL via RPC if it exists, or just try to insert and catch the error.
    // I noticed that the previous probe failed with "Could not find column... in the schema cache"
    // This is a PostgREST error showing the column really doesn't exist.

    console.log("Trying specific known columns...");
    const testCols = ['agent', 'agent_name', 'message', 'content', 'log_message', 'text', 'metadata', 'created_at', 'action'];

    // We can't easily query information_schema via PostgREST unless exposed.
    // Let's assume the worst: the table is missing or columns are weird.
}

checkColumns();
