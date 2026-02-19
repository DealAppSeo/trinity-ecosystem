import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDeadAgents() {
    console.log("🔍 Checking Agent Activity...");
    const { data } = await supabase.from('trinity_agent_registry').select('agent_name, last_active, status');

    const now = new Date();
    data?.forEach(a => {
        const last = new Date(a.last_active);
        const diff = Math.floor((now.getTime() - last.getTime()) / 60000);
        console.log(`${a.agent_name} | ${a.status} | Last active: ${diff}m ago`);
    });
}
checkDeadAgents();
