import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load ENV
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL is missing!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const evergreenMissions = [
    {
        title: "[EVERGREEN] System Self-Test & Bug Hunt",
        description: "Test swarm (e.g., simulate failures, verify BFT), report bugs/improvements.",
        task_type: 'code',
        priority: 90,
        status: 'pending',
        metadata: { squad: 'ALPHA', required_artifacts: ['Report.md', 'code_fix.patch'] }
    },
    {
        title: "[EVERGREEN] Research LLMs/SLMs/Routing",
        description: "Research new free LLMs/SLMs (e.g., Groq/Gemini variants), routing services (ANFIS alternatives), integrate recommendations.",
        task_type: 'research',
        priority: 70,
        status: 'pending',
        metadata: { squad: 'BETA', required_artifacts: ['Research_report.md', 'routing_spec.json'] }
    },
    {
        title: "[EVERGREEN] Optimize Free AI Arbitrage",
        description: "Analyze/optimize ANFIS for free AIs (e.g., HuggingFace models), test cost reductions.",
        task_type: 'data',
        priority: 85,
        status: 'pending',
        metadata: { squad: 'GAMMA', required_artifacts: ['Optimization_report.md', 'anfis_config.yaml'] }
    },
    {
        title: "[EVERGREEN] Ethical Audit & Virtue Alignment",
        description: "Audit tasks/artifacts for virtues (Philippians 4:8), suggest reorgs/escalations.",
        task_type: 'audit',
        priority: 60,
        status: 'pending',
        metadata: { squad: 'ALPHA', required_artifacts: ['Audit_report.md'] }
    },
    {
        title: "[EVERGREEN] HyperDAG Web3 Integration",
        description: "Research/integrate HyperDAG features (e.g., zk-proofs for artifacts, ERC-8004 bridges).",
        task_type: 'research',
        priority: 95,
        status: 'pending',
        metadata: { squad: 'GAMMA', required_artifacts: ['Integration_spec.md', 'proof_poc.rs'] }
    },
    {
        title: "[EVERGREEN] User Feedback Loop Simulation",
        description: "Simulate user queries (e.g., 'Clarify X'), test escalation/smart questions, improve messaging.",
        task_type: 'report',
        priority: 40,
        status: 'pending',
        metadata: { squad: 'BETA', required_artifacts: ['Feedback_report.md'] }
    },
    {
        title: "[EVERGREEN] Gemini: System Oversight",
        description: "Antigravity: Self-monitor swarm; if idle agents > 3, seed evergreens; adjust ANFIS for load.",
        task_type: 'meta',
        priority: 100,
        status: 'pending',
        assigned_to: 'trinity-orch', // Assigned to the chief orchestrator
        metadata: { required_artifacts: ['Swarm_vitality_report.md'] }
    },
    {
        title: "[MISSION] Clawdbot Integration Blueprint",
        description: "Draft a technical implementation spec for bridging Trinity with Clawdbot JSON-RPC for Discord/Telegram notifications.",
        task_type: 'research',
        priority: 95,
        status: 'pending',
        metadata: { squad: 'GAMMA', required_artifacts: ['clawdbot_spec.md'] }
    },
    {
        title: "[MISSION] Autonomous Skill Acquisition",
        description: "GCM: Identify a trend in AI safety or coordination, then spawn a research task for Sophia to deep dive.",
        task_type: 'meta',
        priority: 90,
        status: 'pending',
        assigned_to: 'trinity-gcm',
        metadata: { required_artifacts: ['skill_acquisition_plan.md'] }
    }
];

async function seedDogfoodEvergreens() {
    console.log('--- SEEDING DOGFOOD EVERGREENS (Grok 2026) ---');

    // First, clear existing generic evergreens to make space for high-value ones if needed
    // Actually, we'll just insert these as the highest priority

    const { error } = await supabase.from('trinity_tasks').insert(evergreenMissions);

    if (error) {
        console.error('Seeding error:', error.message);
        return;
    }

    console.log('✅ Successfully seeded 7 high-value dogfooding missions.');
}

seedDogfoodEvergreens();
