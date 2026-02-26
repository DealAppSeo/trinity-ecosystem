
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function runAudit() {
    const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log("--- EVERGREEN BY TITLE ---");
    const { data: evergreenTasks } = await supabase
        .from('trinity_tasks')
        .select('id, title, status')
        .ilike('title', '%[EVERGREEN]%');

    if (evergreenTasks) {
        const stats = evergreenTasks.reduce((acc: any, t: any) => {
            acc[t.status] = (acc[t.status] || 0) + 1;
            return acc;
        }, {});
        console.log(JSON.stringify(stats, null, 2));
    }
}

runAudit();
