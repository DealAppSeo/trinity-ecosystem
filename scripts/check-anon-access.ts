import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Missing URL or Anon Key');
    process.exit(1);
}

// STRICTLY USE ANON KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkAnonAccess() {
    console.log('🕵️ Checking Public Access (Anon Key)...');

    const { data: hbData, error: hbError } = await supabase
        .from('trinity_heartbeat')
        .select('*');

    if (hbError) {
        console.error('❌ Heartbeat Access Denied:', hbError.message);
    } else {
        console.log(`✅ Heartbeat Access Granted. Rows: ${hbData?.length || 0}`);
    }

    const { data: regData, error: regError } = await supabase
        .from('trinity_agent_registry')
        .select('*');

    if (regError) {
        console.error('❌ Registry Access Denied:', regError.message);
    } else {
        console.log(`✅ Registry Access Granted. Rows: ${regData?.length || 0}`);
        if (regData) {
            console.log('Visible Agents:', regData.map(a => a.agent_name));
        }
    }
}

checkAnonAccess();
