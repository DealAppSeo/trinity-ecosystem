import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkMissions() {
    console.log('🕵️ Checking Strategic Acceleration Missions...');

    const titles = [
        '[STRATEGY] [NEXUS] Comprehensive Technical Architecture & xMemory Deep-Dive',
        '[STRATEGY] [VERITAS] AI Trinity Symphony White Paper V1: The Resonant Protocol',
        '[GROWTH] [TORCH] Social Visibility: \'Resurrecting the Symphony\' LinkedIn/X Campaign',
        '[BUSINESS] [SOPHIA] 2026 AI Grant & Hackathon Scouting Report',
        '[INNOVATION] [MEL] Blue Ocean Strategy: Lean Startup Pivot Analysis',
        '[STARTUP] [CHESED] Startup Weekend MVP: Viral Loop & Retention Engine'
    ];

    const { data: tasks, error } = await supabase
        .from('trinity_tasks')
        .select('id, title, status, claimed_by, started_at')
        .in('title', titles);

    if (error) {
        console.error('❌ Error fetching missions:', error.message);
        return;
    }

    if (tasks && tasks.length > 0) {
        tasks.forEach(t => {
            console.log(`\n📌 [${t.status.toUpperCase()}] ${t.title}`);
            console.log(`   - Claimed By: ${t.claimed_by || 'UNASSIGNED'}`);
            console.log(`   - ID: ${t.id}`);
            if (t.started_at) console.log(`   - Started At: ${t.started_at}`);
        });
    } else {
        console.log('⚠️ No seeded missions found. (Did seed script run?)');
    }
}

checkMissions();
