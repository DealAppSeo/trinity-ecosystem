
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

import * as path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("Debug: CWD =", process.cwd());
console.log("Debug: .env path =", path.resolve(__dirname, '../.env'));
console.log("Debug: Env Keys Loaded =", Object.keys(process.env).filter(k => k.includes('SUPABASE')));

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Missing Supabase URL or Service Key. Check .env file.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function healZombieTasks() {
    console.log("🏥 Starting Trinity System Healing...");
    console.log(`🔌 Connecting to ${SUPABASE_URL}`);

    // 1. Count Zombies
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count, error: countError } = await supabase
        .from('trinity_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_progress')
        .lt('updated_at', oneHourAgo);

    if (countError) {
        console.error("❌ Failed to count zombies:", countError.message);
        return;
    }

    console.log(`🧟 Found ${count} zombie tasks (in_progress > 1 hour).`);

    if (count === 0) {
        console.log("✨ System is clean. No healing needed.");
        return;
    }

    // 2. Reset them
    console.log("💉 Injecting synthesis serum (Resetting to 'pending')...");

    const { data, error: updateError } = await supabase
        .from('trinity_tasks')
        .update({
            status: 'pending',
            claimed_by: null,
            started_at: null,
            metadata: {
                reset_reason: 'stale_in_progress_detected_by_cleanup',
                healed_at: new Date().toISOString()
            }
        })
        .eq('status', 'in_progress')
        .lt('updated_at', oneHourAgo)
        .select();

    if (updateError) {
        console.error("❌ Failed to heal tasks:", updateError.message);
    } else {
        console.log(`✅ Successfully healed ${data.length} tasks.`);
        console.log("🔄 Agents can now reclaim these tasks.");
    }
}

healZombieTasks().catch(console.error);
