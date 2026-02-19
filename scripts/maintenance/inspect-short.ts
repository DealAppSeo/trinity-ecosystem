import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectStuck() {
    const { data } = await supabase.from('trinity_tasks').select('status, title, claimed_by').not('status', 'in', '("pending","done","verified")');
    if (data) {
        data.forEach(t => console.log(`${t.status} | ${t.claimed_by} | ${t.title.substring(0, 30)}`));
    }
}
inspectStuck();
