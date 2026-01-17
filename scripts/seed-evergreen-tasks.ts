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
        title: "HyperDAG v8.1.3 Technical Whitepaper Audit",
        description: "Review the current codebase against the HyperDAG Part IV (ERC-8004 Bridge Layer) specifications. Identify any gaps in ZK-STARK proof generation logic.",
        assigned_to: "trinity-shofet",
        priority: 1,
        requires_consensus: true,
        task_type: "research"
    },
    {
        title: "Multiplicative GNN Convergence Analysis",
        description: "Analyze the current RepID scaling logs. Verify if the φ=1.618 geometric mean is achieving O(log n) convergence as per the provisional patent.",
        assigned_to: "trinity-science",
        priority: 2,
        requires_consensus: false,
        task_type: "analysis"
    },
    {
        title: "ERC-8004 Cross-Chain Messaging Strategy",
        description: "Propose a messaging sequence for bridging Trinity Identities to the HyperDAG testnet. Focus on privacy-preserving SBT visibility.",
        assigned_to: "trinity-orch",
        priority: 1,
        requires_consensus: true,
        task_type: "design"
    },
    {
        title: "Swarm Ethics & Virtue Alignment Check",
        description: "Audit recent agent artifacts for alignment with Philippians 4:8 virtues. Generate a 'Ethical Resonance' report.",
        assigned_to: "trinity-sophia",
        priority: 3,
        requires_consensus: false,
        task_type: "audit"
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
