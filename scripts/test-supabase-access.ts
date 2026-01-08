
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load Env
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Missing Credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testConnection() {
    console.log(`Testing connection to: ${SUPABASE_URL}`);
    const { data, error } = await supabase.from('trinity_agent_registry').select('count', { count: 'exact', head: true });

    if (error) {
        console.error("❌ Connection Failed:", error.message);
    } else {
        console.log("✅ Connection Successful! Access verified.");
        console.log(`   Found ${data} records (or count response).`);
    }
}

testConnection();
