import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function inspect() {
    const { data, error } = await supabase
        .from('trinity_agent_groups')
        .select('*');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Found Agents:', data?.map(d => d.agent_name + ' (' + d.group_name + ')'));
    }
}

inspect();
