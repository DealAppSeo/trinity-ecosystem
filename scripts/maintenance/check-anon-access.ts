import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
    console.error("❌ SUPABASE_URL or SUPABASE_ANON_KEY missing from environment!");
    process.exit(1);
}

const supabase = createClient(url, key);

async function checkAnon() {
    console.log("🕵️ Checking Anonymous (Public) Access...");

    // 1. Try to read artifacts
    const { data: art, error: artErr } = await supabase.from('trinity_artifacts').select('id, title').limit(5);
    if (artErr) console.log("❌ Artifacts RLS Error:", artErr.message);
    else console.log(`✅ Artifacts Read: ${art?.length} found (Anon)`);

    // 2. Try to read tasks
    const { data: tasks, error: taskErr } = await supabase.from('trinity_tasks').select('id').limit(5);
    if (taskErr) console.log("❌ Tasks RLS Error:", taskErr.message);
    else console.log(`✅ Tasks Read: ${tasks?.length} found (Anon)`);
}

checkAnon();
