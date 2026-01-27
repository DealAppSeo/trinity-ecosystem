import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SERVICE_NAME = process.argv[2] || 'trinity-infrastructure';
const SERVICE_TYPE = process.argv[3] || 'SYSTEM';

async function serviceHeartbeat() {
    console.log(`📡 [${SERVICE_NAME}] Starting Service Heartbeat...`);

    const pulse = async () => {
        const now = new Date().toISOString();

        // 1. Update Registry as a "System" agent
        const { error: regError } = await supabase
            .from('trinity_agent_registry')
            .upsert({
                agent_name: SERVICE_NAME,
                status: 'online',
                last_active: now,
                squad: 'INFRA',
                current_tier: SERVICE_TYPE,
                current_task_summary: `[SERVICE] Monitoring ${SERVICE_NAME} core health.`,
                reputation_score: 100 // Infrastructure is always trusted
            }, { onConflict: 'agent_name' });

        if (regError) console.error(`❌ [${SERVICE_NAME}] Registry update failed:`, regError.message);

        // 2. Add entry to trinity_heartbeat for dashboard visibility
        const { error: hbError } = await supabase
            .from('trinity_heartbeat')
            .upsert({
                agent: SERVICE_NAME,
                status: 'active',
                last_seen: now,
                version: '8.1.5-System'
            }, { onConflict: 'agent' });

        if (hbError) console.error(`❌ [${SERVICE_NAME}] Heartbeat update failed:`, hbError.message);

        if (!regError && !hbError) {
            console.log(`✅ [${SERVICE_NAME}] Pulse sent at ${now}`);
        }
    };

    // Pulse immediately then every 30 seconds
    await pulse();
    setInterval(pulse, 30000);
}

serviceHeartbeat();
