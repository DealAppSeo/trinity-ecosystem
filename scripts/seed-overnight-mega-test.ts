import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MEGA_TEST_MISSIONS = [
    // --- ALPHA SQUAD ---
    {
        title: '[MEGA-TEST] [RESEARCH] Brave Search Stress Test',
        description: 'Perform a deep dive into "Agentic Swarm Redundancy Patterns (2026)". \n\nDirectives:\n1. Use Brave Search to find independent research papers.\n2. Compare them against standard OpenAI/Tavily summaries.\n3. Artifact: Brave_Redundancy_Report.md',
        task_type: 'research',
        priority: 50,
        assigned_to: 'ALPHA'
    },
    {
        title: '[MEGA-TEST] [VERIFY] Cross-Agent Reputation Audit',
        description: 'Scan the trinity_agent_registry for any reputation discrepancies. \n\nDirectives:\n1. Cross-reference with EvolutionaryLogger logs.\n2. Flag any agent with a "drift" of > 5 points in 24h.\n3. Artifact: Rep_Consistency_Audit.json',
        task_type: 'audit',
        priority: 40,
        assigned_to: 'ALPHA'
    },

    // --- BETA SQUAD ---
    {
        title: '[MEGA-TEST] [KNOWLEDGE] Doc360 SOP Expansion',
        description: 'Draft a NEW Standard Operating Procedure (SOP) for "Agent Tool Redundancy Fallback". \n\nDirectives:\n1. Explain the fallback order (Doc360 -> Tavily -> Brave).\n2. Format it specifically for Document360 upload.\n3. Artifact: SOP_Redundancy_Fallback.md',
        task_type: 'content',
        priority: 50,
        assigned_to: 'BETA'
    },
    {
        title: '[MEGA-TEST] [AUDIT] Context Window Optimizer',
        description: 'Review the last 10 tasks that used Flowise. \n\nDirectives:\n1. Identify if context window size affected output quality.\n2. Suggest optimal token limits for automation chains.\n3. Artifact: Context_Strategy_Report.md',
        task_type: 'research',
        priority: 45,
        assigned_to: 'BETA'
    },

    // --- GAMMA SQUAD ---
    {
        title: '[MEGA-TEST] [ORCHESTRATION] Flowise Chain Architect',
        description: 'Design a Flowise Chatflow that integrates Brave Search and Document360 into a single RAG chain. \n\nDirectives:\n1. Sketch the node connections in Mermaid.\n2. Detail the required API keys for the chain.\n3. Artifact: Flowise_Hybrid_RAG_Design.mermaid',
        task_type: 'design',
        priority: 60,
        assigned_to: 'GAMMA'
    },
    {
        title: '[MEGA-TEST] [UI] Evolutionary Dashboard Mockup',
        description: 'Create a conceptual React component for the "Evolutionary Tier" visualization. \n\nDirectives:\n1. Use glassmorphism and neon gradients.\n2. Show agent tier transitions (Assist -> Approve -> Act -> Learn).\n3. Artifact: EvoDashboard.tsx',
        task_type: 'code',
        priority: 55,
        assigned_to: 'GAMMA'
    },

    // --- ORCHESTRATION ---
    {
        title: '[MEGA-TEST] [STRATEGY] ANFIS Performance Audit',
        description: 'Analyze the reward/penalty trends in the IntelligenceRouter. \n\nDirectives:\n1. Group rewards by squad.\n2. Identify the "bottleneck squad" for today.\n3. Artifact: ANFIS_Strategic_Report.md',
        task_type: 'research',
        priority: 70,
        assigned_to: 'ORCH'
    }
];

async function seedMegaTest() {
    console.log('🚀 INIT: Overnight Mega-Test & Training Seeder...');

    const { error } = await supabase.from('trinity_tasks').insert(
        MEGA_TEST_MISSIONS.map(m => ({
            ...m,
            status: 'pending',
            created_at: new Date().toISOString(),
            metadata: {
                mission_id: 'MEGA_TEST_TRAINING_V1',
                evolutionary_tier: m.priority >= 60 ? 'ELITE' : (m.priority >= 40 ? 'ADVANCED' : 'FOUNDATION'),
                test_tools: ['Brave', 'Doc360', 'Flowise']
            }
        }))
    );

    if (error) {
        console.error('❌ SEED FAILED:', error.message);
    } else {
        console.log(`✅ SUCCESS: ${MEGA_TEST_MISSIONS.length} mega-test tasks seeded.`);
    }
}

seedMegaTest();
