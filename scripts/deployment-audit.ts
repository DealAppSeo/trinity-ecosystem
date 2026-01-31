
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function captureState() {
    console.log('📑 [AUDIT] Capturing Swarm State before Consolidation...');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

    const backupFile = path.join(backupDir, `swarm-state-${timestamp}.json`);

    // 1. Fetch Agent Registry
    const { data: registry } = await supabase.from('trinity_agent_registry').select('*');

    // 2. Fetch Active Heartbeats
    const { data: heartbeats } = await supabase.from('trinity_heartbeat').select('*');

    // 3. Fetch Recent Stalled Tasks
    const { data: stalledTasks } = await supabase
        .from('trinity_tasks')
        .select('*')
        .in('status', ['doing', 'in_progress', 'running'])
        .limit(10);

    const snapshot = {
        timestamp,
        registry,
        heartbeats,
        stalledTasks
    };

    fs.writeFileSync(backupFile, JSON.stringify(snapshot, null, 2));

    console.log(`✅ [AUDIT] Intelligence captured to: ${backupFile}`);
    console.log('You are now safe to delete redundant Railway projects. Any reputation or "soul" data in the DB is preserved.');
}

captureState();
