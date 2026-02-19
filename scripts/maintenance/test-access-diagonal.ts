
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const anonClient = createClient(url, anonKey);
const serviceClient = createClient(url, serviceKey);

async function testAccess() {
    console.log('🧪 Testing Trinity Table Access (Anon vs Service Role)...');

    const tables = ['trinity_agent_registry', 'trinity_tasks', 'trinity_agent_logs'];

    for (const table of tables) {
        console.log(`\n--- Table: ${table} ---`);

        // Test Service Role
        const { count: sCount, error: sError } = await serviceClient.from(table).select('*', { count: 'exact', head: true });
        if (sError) console.error(`❌ Service Role Error: ${sError.message}`);
        else console.log(`✅ Service Role: ${sCount} rows found.`);

        // Test Anon Role
        const { count: aCount, error: aError } = await anonClient.from(table).select('*', { count: 'exact', head: true });
        if (aError) console.error(`❌ Anon Role Error: ${aError.message}`);
        else console.log(`✅ Anon Role: ${aCount} rows found.`);
    }
}

testAccess();
