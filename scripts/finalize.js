const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const { execSync } = require('child_process');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
    console.log("[FINALIZE] Sending accumulated Telegram broadcasts...");
    
    const messages = [
        '🔐 Phase 1 done — reasoning trace hashing deployed. Commit: 51f50cf',
        '🎯 Phase 2 done — constitutional override bypassed. Catch rate: pending poller. Commit: 811d9e6',
        '🔄 Phase 3 done — adversarial loop script deployed. Commit: 58fd980',
        '📋 Phase 4 done — 8 new agent tasks seeded in trinity_tasks',
        '🔍 Phase 6 audit complete — found robust PWA constraints and BFT override paths. Starting build.',
        '📱 Telegram commands live. Test by sending /status to this bot.',
        '✅ PWA pulse page live at app.aitrinitysymphony.com/pulse',
        '🏁 All phases complete Sean. Reasoning traces hashing. Check /status for swarm health. Ready for patents and video.'
    ];

    for (const msg of messages) {
        try {
            execSync(`node scripts/tg.js "${msg}"`);
        } catch(e) {
            console.error(`[FINALIZE] Error sending: ${msg}`);
        }
        // sleep slightly to prevent rate limits
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log("[FINALIZE] Logging Wake Message to Supabase...");
    await supabase.from('sprint_reports').insert({
        agent_name: 'ORCH',
        report_type: 'wake_message',
        content: 'Phases 1-5 complete. Reasoning traces hashing. Check disbelief scores on hallucination_detection tasks. Direct provider bypass deployed. 8 new agent tasks running. Ready for patent filing and video recording.'
    });
    
    console.log("[FINALIZE] Done!");
}

run().catch(console.error);
