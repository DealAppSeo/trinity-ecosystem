import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const OVERNIGHT_MISSIONS = [
    // --- TIER 1: THE FOUNDATION (Audit & Sanity) ---
    {
        title: '[EVERGREEN] [FOUNDATION] Swarm Identity & Registry Audit',
        description: 'Verify that exactly 12 agents and 2 infra services are listed as "online". \n\nDirectives:\n1. Audit public.trinity_agent_registry.\n2. Identify any agent with a RepID that is not a whole number.\n3. Create a clean Registry Status Report.\n4. Artifact: Swarm_Registry_Audit.md',
        task_type: 'research',
        priority: 10,
        assigned_to: 'ALPHA'
    },
    {
        title: '[EVERGREEN] [FOUNDATION] Artifact Library Taxonomy Check',
        description: 'Analyze the last 20 artifacts. Categorize them into Code, Design, Research, or Document. \n\nDirectives:\n1. Determine if any artifacts are missing proper metadata.\n2. Suggest a better naming convention for the next batch.\n3. Artifact: Library_Taxonomy_Report.md',
        task_type: 'research',
        priority: 10,
        assigned_to: 'BETA'
    },
    {
        title: '[EVERGREEN] [FOUNDATION] System Latency & Pulse Check',
        description: 'Measure the heartbeat intervals for all 14 active entities. \n\nDirectives:\n1. Check trinity_heartbeat timestamps.\n2. Flag any entity that has not pulsed in > 5 minutes.\n3. Artifact: System_Latency_Audit.md',
        task_type: 'research',
        priority: 10,
        assigned_to: 'ORCH'
    },

    // --- TIER 2: CONSTRUCTION (Code & Design) ---
    {
        title: '[EVERGREEN] [BUILD] Glassmorphism Alert System (React)',
        description: 'Create a reusable React component for different alert types (Success, Warning, Error) using "Liquid Glass" aesthetics. \n\nDirectives:\n1. Use Tailwind backdrop-blur-md and semi-transparent borders.\n2. Include smooth entry/exit animations (Framer Motion style).\n3. Code must be TypeScript.\n4. Artifact: GlassAlerts.tsx',
        task_type: 'code',
        priority: 25,
        assigned_to: 'GAMMA'
    },
    {
        title: '[EVERGREEN] [DESIGN] Swarm Logic Flux Diagram',
        description: 'Visualize the logic flow of an agent deciding between Execution and Verification. \n\nDirectives:\n1. Use Mermaid.js (sequenceDiagram).\n2. Detail the "Workflow Alternator" logic in ConstitutionalAgent.ts.\n3. Artifact: Agent_Decision_Cycle.mermaid',
        task_type: 'design',
        priority: 25,
        assigned_to: 'GAMMA'
    },
    {
        title: '[EVERGREEN] [BUILD] Minimalist Progress Stepper (Tailwind)',
        description: 'Design a horizontal progress stepper for the 4-tier Evolutionary Mission. \n\nDirectives:\n1. Use neon accent colors for active steps.\n2. Ensure it is fully responsive.\n3. Artifact: EvolutionaryStepper.tsx',
        task_type: 'code',
        priority: 25,
        assigned_to: 'GAMMA'
    },

    // --- TIER 3: STRATEGY (Intelligence & Data) ---
    {
        title: '[EVERGREEN] [STRATEGY] Agentic Tool Usage Analysis',
        description: 'Perform a deep dive into which MCP tools are used most frequently. \n\nDirectives:\n1. Analyze trinity_agent_logs for "tool_call" events.\n2. Identify the most successful vs most failed tools.\n3. Provide a recommendation for tool hardening.\n4. Artifact: Tool_Usage_Intelligence.md',
        task_type: 'research',
        priority: 40,
        assigned_to: 'ALPHA'
    },
    {
        title: '[EVERGREEN] [WISDOM] The Trinity Manifesto: Section II',
        description: 'Draft the "Economic Arbitrage" section of the Trinity Manifesto. \n\nDirectives:\n1. Explain how the swarm optimizes LLM costs via ANFIS and tiered model selection.\n2. Use a visionary, intellectual tone.\n3. Artifact: Manifesto_Economic_Arbitrage.md',
        task_type: 'content',
        priority: 40,
        assigned_to: 'ORCH'
    },

    // --- TIER 4: EVOLUTION (Self-Healing & Learning) ---
    {
        title: '[EVERGREEN] [EVOLUTION] Automated Build Error Pattern Mining',
        description: 'Scan the build logs for recurring TypeScript or Supabase errors. \n\nDirectives:\n1. Group similar errors by stack trace or message.\n2. Propose a specific code fix for the most frequent error.\n3. Artifact: Build_Error_Patterns.json',
        task_type: 'research',
        priority: 60,
        assigned_to: 'BETA'
    },
    {
        title: '[EVERGREEN] [EVOLUTION] Self-Correcting MCP Logic Proposal',
        description: 'Propose a design for an MCP tool that can "Fix Itself" when it receives a 401 or 404 error. \n\nDirectives:\n1. Detail how the agent should re-authenticate or search for the correct endpoint.\n2. Create a Mermaid flowchart of the healing loop.\n3. Artifact: Self_Healing_MCP_Design.md',
        task_type: 'design',
        priority: 60,
        assigned_to: 'GAMMA'
    }
];

async function seedOvernightSymphony() {
    console.log('🌌 INIT: Overnight Evolutionary Symphony Mission...');

    const { error } = await supabase.from('trinity_tasks').insert(
        OVERNIGHT_MISSIONS.map(m => ({
            ...m,
            status: 'pending',
            created_at: new Date().toISOString(),
            metadata: {
                mission_id: 'OVERNIGHT_SYMPHONY_V1',
                evolutionary_tier: m.priority >= 60 ? 'ELITE' : (m.priority >= 25 ? 'ADVANCED' : 'FOUNDATION'),
                is_overnight: true
            }
        }))
    );

    if (error) {
        console.error('❌ SEED FAILED:', error.message);
    } else {
        console.log(`✅ SUCCESS: ${OVERNIGHT_MISSIONS.length} progressive tasks seeded.`);
    }
}

seedOvernightSymphony();
