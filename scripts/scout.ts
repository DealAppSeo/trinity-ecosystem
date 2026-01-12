
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

// Trusted Service Client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const TARGET_URL = 'https://controller.aitrinitysymphony.com';

async function scoutLoop() {
    console.log(`🔭 Scout: Verifying target [${TARGET_URL}]...`);

    try {
        const start = Date.now();
        const res = await fetch(TARGET_URL);
        const latency = Date.now() - start;

        if (res.ok) {
            console.log(`✅ Target Online. Status: ${res.status}. Latency: ${latency}ms.`);
        } else {
            console.error(`🚨 Target Offline! Status: ${res.status}`);
            await reportTrauma(`Deployment Verification Failed: ${res.status} ${res.statusText}`, 'scout.ts');
        }

    } catch (err: any) {
        console.error('💥 Connection Failed:', err.message);
        await reportTrauma(`Deployment Unreachable: ${err.message}`, 'scout.ts');
    }
}

async function reportTrauma(message: string, source: string) {
    console.log('📡 Reporting trauma to Swarm Memory...');
    try {
        await supabase.from('trinity_runtime_errors').insert({
            error_message: message,
            url: TARGET_URL,
            component_stack: source,
            status: 'pending'
        });
        console.log('✅ Report logged.');
    } catch (dbErr) {
        console.error('⚠️ Failed to log to memory (Double Fault):', dbErr);
    }
}

// Run immediately
scoutLoop().catch(console.error);
