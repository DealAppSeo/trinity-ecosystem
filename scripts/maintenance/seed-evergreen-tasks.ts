import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load from root .env.local if it exists
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// FORCE CREDENTIALS if missing (Reflecting run-agent.ts injection)
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

const EVERGREEN_TASKS = [
    {
        title: "Semantic RAG Optimization & High-Dim Analysis",
        description: "Review current retrieval latency and context precision. Implement a weighted vector-search boost for Philippians 4:8 high-virtue nodes. Goal: Reduce RAG latency by 20%.",
        assigned_to: "trinity-hdm",
        priority: 1,
        requires_consensus: true,
        task_type: "infrastructure"
    },
    {
        title: "HyperDAG Web3 Integration: ERC-8004 Proof Layer",
        description: "Design the bridge interface between the off-chain Trinity Swarm and the on-chain HyperDAG testnet. Focus on ZKP-secured reputation pinning.",
        assigned_to: "trinity-nexus",
        priority: 1,
        requires_consensus: true,
        task_type: "code"
    },
    {
        title: "Swarm Ethics & Virtue Alignment Audit",
        description: "Analyze the last 50 agent artifacts for 'Resurrection' mentality and Subjective Slashing adherence. Generate a Virtue Resonance Report.",
        assigned_to: "trinity-sophia",
        priority: 2,
        requires_consensus: false,
        task_type: "audit"
    },
    {
        title: "Multiplicative GNN Convergence & RepID Scaling",
        description: "Analyze RepID logs for the last 12 hours. Verify if the Golden Ratio (φ) scaling prevents reputation inflation while rewarding truth-seeking consistency.",
        assigned_to: "trinity-veritas",
        priority: 1,
        requires_consensus: true,
        task_type: "analysis"
    },
    {
        title: "Ecosystem Integration: Founder App UX Heatmap",
        description: "Analyze user interaction with the 'Amber Pulse' and 'Blue Verification' indicators. Propose UX refinements for the mobile-first dashboard.",
        assigned_to: "trinity-gcm",
        priority: 2,
        requires_consensus: false,
        task_type: "design"
    }
];

async function seed() {
    console.log('--- [TRINITY EVERGREEN SEEDER] ---');
    console.log(`Targeting: ${url}`);

    const { data, error } = await supabase
        .from('trinity_tasks')
        .insert(EVERGREEN_TASKS.map(t => ({
            ...t,
            status: 'pending',
            created_at: new Date().toISOString()
        })));

    if (error) {
        console.error('❌ Seeding failed:', error.message);
    } else {
        console.log(`✅ Successfully seeded ${EVERGREEN_TASKS.length} elite tasks for overnight production.`);
    }
}

seed();
