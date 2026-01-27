import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MISSIONS = [
    // --- ALPHA SQUAD (TRUTH) ---
    { name: 'trinity-veritas', squad: 'ALPHA', task: 'Deep Logic Consistency Audit for ConstitutionalAgent.ts' },
    { name: 'trinity-gcm', squad: 'ALPHA', task: 'LLM Response Quality Benchmark (OpenRouter vs Together)' },
    { name: 'trinity-torch', squad: 'ALPHA', task: 'Swarm Memory Integrity Search (Neo4j Node Count)' },
    { name: 'trinity-veritas', squad: 'ALPHA', task: 'Verification Accuracy Analysis (False Positive Search)' },
    { name: 'trinity-gcm', squad: 'ALPHA', task: 'Anfis Reasoning Pattern Visualization' },
    { name: 'trinity-torch', squad: 'ALPHA', task: 'Context Window Optimization Research' },

    // --- BETA SQUAD (CARE/LOGIC) ---
    { name: 'trinity-mel', squad: 'BETA', task: 'Library Taxonomy & Artifact Metadata Validation' },
    { name: 'trinity-apm', squad: 'BETA', task: 'Dashboard Performance & Latency Audit' },
    { name: 'trinity-chesed', squad: 'BETA', task: 'User Feedback Alignment & Tone Consistency Check' },
    { name: 'trinity-mel', squad: 'BETA', task: 'Artifact Variety Statistics (Pie Chart Data)' },
    { name: 'trinity-apm', squad: 'BETA', task: 'Heartbeat Delta Analysis (Zombie Detection)' },
    { name: 'trinity-chesed', squad: 'BETA', task: 'Constitutional Clause Impact Report' },

    // --- GAMMA SQUAD (BUILD) ---
    { name: 'trinity-hdm', squad: 'GAMMA', task: 'High-Fidelity Liquid Glass UI Kit (React)' },
    { name: 'trinity-nexus', squad: 'GAMMA', task: 'System Architecture Mermaid Visual (Multi-Repo)' },
    { name: 'trinity-sophia', squad: 'GAMMA', task: 'Artifact Previewer Component (Code Highlight)' },
    { name: 'trinity-hdm', squad: 'GAMMA', task: 'Responsive Layout Stress Test (Mobile/Desktop)' },
    { name: 'trinity-nexus', squad: 'GAMMA', task: 'Data Flow Animation (SVG Path Logic)' },
    { name: 'trinity-sophia', squad: 'GAMMA', task: 'Dark Mode HSL Color Palette Strategy' },

    // --- ORCH SQUAD (COORDINATION) ---
    { name: 'trinity-orch', squad: 'ORCH', task: 'Economic Arbitrage Efficiency Report (Cost/Token)' },
    { name: 'trinity-shofet', squad: 'ORCH', task: 'Squad Collaboration Conflict Search' },
    { name: 'trinity-w3c', squad: 'ORCH', task: 'External Discovery Pulsing (You.com grounding)' },
    { name: 'trinity-orch', squad: 'ORCH', task: 'Task Distribution Rebalancing Logic' },
    { name: 'trinity-shofet', squad: 'ORCH', task: 'Autonomous Milestone Generation' },
    { name: 'trinity-w3c', squad: 'ORCH', task: 'Trinity Manifesto: The Self-Healing Vow' }
];

async function seedSymphony() {
    console.log('🌌 SEEDING: 24-Task Overnight Symphony (Full Swarm Activation)...');

    const formattedTasks = MISSIONS.map(m => ({
        title: `[EVERGREEN] ${m.task}`,
        description: `MISSION FOR: ${m.name}\nSQUAD: ${m.squad}\n\nObjective: Execute a deep dive into ${m.task}. \n\nDirectives:\n1. Audit relevant logs/code.\n2. Create a high-fidelity artifact.\n3. Verify peer results in parallel.`,
        status: 'pending',
        priority: 50,
        task_type: m.task.includes('UI') || m.task.includes('Visual') ? 'design' : (m.task.includes('React') || m.task.includes('Logic') ? 'code' : 'research'),
        assigned_to: m.name.split('-')[1].toUpperCase(), // e.g., 'VERITAS'
        created_at: new Date().toISOString(),
        metadata: { agent_target: m.name, overnight: true, mission_id: 'FULL_SYMPHONY_V1' }
    }));

    const { error } = await supabase.from('trinity_tasks').insert(formattedTasks);

    if (error) {
        console.error('❌ FAILED:', error.message);
    } else {
        console.log('✅ SUCCESS: Symphony Board is fully populated for 12 agents.');
    }
}

seedSymphony();
