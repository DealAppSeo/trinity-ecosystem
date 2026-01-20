import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load from root .env.local if it exists
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// FORCE CREDENTIALS if missing
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!url || !key) {
    console.error('❌ Missing Supabase credentials.');
    process.exit(1);
}

const supabase = createClient(url, key);

const EVERGREEN_TASKS_2026 = [
    {
        title: "[EVERGREEN] System Health & Anti-Fragility Audit",
        description: "Perform a comprehensive audit of current error logs and system latency. Propose anti-fragile healing strategies for the next 24 hours.",
        assigned_to: "trinity-apm",
        priority: 2,
        requires_consensus: true,
        task_type: "audit"
    },
    {
        title: "[EVERGREEN] Constitution-Virtue Alignment Deep Scan",
        description: "Analyze the last 100 agent interactions for adherence to the Trinity Constitution, specifically the principles of Resurrection and Truth-Seeking.",
        assigned_to: "trinity-sophia",
        priority: 3,
        requires_consensus: false,
        task_type: "audit"
    },
    {
        title: "[EVERGREEN] UI/UX Improvement Proposals: Founders Dashboard",
        description: "Research modern Glassmorphism aesthetics and propose specific CSS/React component improvements for the Founders Command Center.",
        assigned_to: "trinity-gcm",
        priority: 4,
        requires_consensus: false,
        task_type: "design"
    },
    {
        title: "[EVERGREEN] RAG Knowledge Base Expansion",
        description: "Scan public documentation for the latest advancements in Multi-Agent Systems (MAS) and GNN scaling. Synthesize a report for the collective memory.",
        assigned_to: "trinity-hdm",
        priority: 3,
        requires_consensus: true,
        task_type: "research"
    },
    {
        title: "[EVERGREEN] Code Quality & Logic Optimization",
        description: "Review ConstitutionalAgent.ts for potential logic bottlenecks in the task-claiming process. Propose O(log n) scaling optimizations.",
        assigned_to: "trinity-mel",
        priority: 2,
        requires_consensus: true,
        task_type: "code"
    },
    {
        title: "[EVERGREEN] Web3 Reputation Pinning Research",
        description: "Audit the current RepID logic against ERC-8004 standards. Verify ZKP integrity for off-chain reputation pinning.",
        assigned_to: "trinity-nexus",
        priority: 3,
        requires_consensus: true,
        task_type: "research"
    }
];

async function seed() {
    console.log('--- [TRINITY EVERGREEN SEEDER 2026] ---');
    console.log(`Targeting: ${url}`);

    // Check if these tasks already exist to avoid duplicates (optional, but good practice)
    const { data: existingTasks } = await supabase
        .from('trinity_tasks')
        .select('title')
        .in('title', EVERGREEN_TASKS_2026.map(t => t.title));

    const existingTitles = existingTasks?.map(t => t.title) || [];
    const tasksToInsert = EVERGREEN_TASKS_2026.filter(t => !existingTitles.includes(t.title));

    if (tasksToInsert.length === 0) {
        console.log('ℹ️ All 2026 evergreen tasks already exist. Skipping insert.');
        return;
    }

    const { data, error } = await supabase
        .from('trinity_tasks')
        .insert(tasksToInsert.map(t => ({
            ...t,
            status: 'pending',
            created_at: new Date().toISOString()
        })));

    if (error) {
        console.error('❌ Seeding failed:', error.message);
    } else {
        console.log(`✅ Successfully seeded ${tasksToInsert.length} high-value evergreen tasks.`);
    }
}

seed();
