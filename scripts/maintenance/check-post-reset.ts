import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPostReset() {
    console.log("🔍 Checking tasks AFTER V12 Global Alignment...");

    const { data } = await supabase
        .from('trinity_tasks')
        .select('*');

    const total = data?.length || 0;
    const reset = data?.filter(t => t.metadata?.reset_reason === 'GLOBAL_ALIGNMENT_V12') || [];
    const pendingReset = reset.filter(t => t.status === 'pending').length;
    const activeReset = reset.filter(t => t.status === 'doing' || t.status === 'in_progress').length;
    const doneReset = reset.filter(t => t.status === 'done' || t.status === 'verified').length;

    console.log(`📊 Total Tasks: ${total}`);
    console.log(`♻️ Reset Tasks (V12): ${reset.length}`);
    console.log(`   - Still Pending: ${pendingReset}`);
    console.log(`   - Picked Up: ${activeReset}`);
    console.log(`   - Completed: ${doneReset}`);
}
checkPostReset();
