
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../hyperdag-sandbox/.env.local') });

async function auditRegistry() {
    console.log('--- AUDITING SUPABASE SERVICE REGISTRY ---');
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('❌ Missing Supabase credentials in env.');
        return;
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    try {
        const { data, error } = await supabase.from('trinity_service_registry').select('*');
        if (error) throw error;

        console.log(`✅ Found ${data?.length || 0} services.`);
        data?.forEach((s: any) => {
            console.log(`- [${s.is_active ? 'ACTIVE' : 'INACTIVE'}] ${s.service_key} (${s.provider})`);
        });
    } catch (e: any) {
        console.error('❌ Registry audit failed:', e.message);
    }
}

auditRegistry();
