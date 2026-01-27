export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { createClient } = await import('@supabase/supabase-js');

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.warn('📡 [Ecosystem] Heartbeat disabled: Missing Supabase credentials.');
            return;
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const serviceName = 'trinity-ecosystem';

        const pulse = async () => {
            const now = new Date().toISOString();
            try {
                // 1. Update Registry
                await supabase
                    .from('trinity_agent_registry')
                    .upsert({
                        agent_name: serviceName,
                        status: 'online',
                        last_active: now,
                        squad: 'INFRA',
                        current_tier: 'SYSTEM',
                        current_task_summary: '[SERVICE] Main Hub & UI Controller Active.',
                        reputation_score: 100
                    }, { onConflict: 'agent_name' });

                // 2. Update Heartbeat
                await supabase
                    .from('trinity_heartbeat')
                    .upsert({
                        agent: serviceName,
                        status: 'active',
                        last_seen: now,
                        version: '8.1.5-System-Next'
                    }, { onConflict: 'agent' });

                // console.log(`✅ [${serviceName}] Pulse sent at ${now}`);
            } catch (e: any) {
                console.error(`❌ [${serviceName}] Heartbeat failed:`, e.message);
            }
        };

        // Pulse immediately and then every 30s
        pulse();
        setInterval(pulse, 30000);
        console.log(`📡 [Ecosystem] Infrastructure Heartbeat active.`);
    }
}
