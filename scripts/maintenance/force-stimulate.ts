
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const ASSIGNMENTS = [
    { title: '[ALPHA] Blind Historic Backtest', agent: 'trinity-veritas' },
    { title: '[GAMMA] Live Market Simulation', agent: 'trinity-nexus' },
    { title: '[ORCH] Triadic Resonance Synthesis', agent: 'trinity-orch' },
    { title: '[BETA] Mutual Learning Audit', agent: 'trinity-mel' }
];

async function forceStimulate() {
    console.log("⚡ Force-Stimulating Crypto Missions...");

    for (const a of ASSIGNMENTS) {
        const { data, error } = await supabase
            .from('trinity_tasks')
            .update({ 
                status: 'pending', 
                assigned_to: a.agent,
                priority: 100
            })
            .ilike('title', a.title)
            .select();

        if (error) {
            console.error(`❌ Failed to force-assign ${a.title}:`, error.message);
        } else if (data && data.length > 0) {
            console.log(`✅ Force-assigned ${a.title} to ${a.agent}`);
        } else {
             console.log(`⚠️  Mission "${a.title}" not found in trinity_tasks. Creating it...`);
             const { error: insError } = await supabase.from('trinity_tasks').insert({
                 title: a.title,
                 assigned_to: a.agent,
                 status: 'pending',
                 priority: 100,
                 created_at: new Date().toISOString()
             });
             if (insError) console.error(`❌ Global Seed Failed: ${insError.message}`);
        }
    }
}

forceStimulate().catch(console.error);
