
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const AUTONOMOUS_MISSIONS = [
    // --- SELF-HEALING & DIAGNOSTICS ---
    {
        title: '[EVOLUTION] [HEAL] Runtime Error Audit & Resolution',
        description: 'Analyze the latest entries in `trinity_runtime_errors`. \n\nDirectives:\n1. Filter for errors occurring in the last 2 hours.\n2. Group by error message.\n3. Identify the root cause for at least 2 distinct error types.\n4. Create a "Healing Report" with recommended code fixes.\n5. Artifact: Runtime_Healing_Report.md',
        task_type: 'self-healing',
        priority: 10,
        assigned_to: 'GAMMA' // Build/Infra Squad (Sophia, Nexus, HDM)
    },
    {
        title: '[EVOLUTION] [HEAL] Stuck Task Recovery Protocol',
        description: 'Scan `trinity_tasks` for tasks stuck in "in_progress" for more than 30 minutes without a heartbeat update. \n\nDirectives:\n1. Identify "zombie" tasks.\n2. Force-unlock tasks by resetting status to "pending" if they are truly abandoned.\n3. Log the recovery actions in a report.\n4. Artifact: Zombie_Task_Cleanup.md',
        task_type: 'maintenance',
        priority: 9,
        assigned_to: 'ORCH' // Orchestration (Orch, W3C, Shofet)
    },

    // --- PEER REVIEW & QUALITY CONTROL ---
    {
        title: '[EVOLUTION] [QC] Cross-Agent Artifact Peer Review',
        description: 'Audit the last 10 artifacts saved to `trinity_artifacts`. \n\nDirectives:\n1. Evaluate quality based on utility, readability, and adherence to requirements.\n2. Provide constructive feedback for the creators.\n3. Mark artifacts as "Verified" if they meet the standard.\n4. Artifact: Peer_Review_Symphony.md',
        task_type: 'verification',
        priority: 8,
        assigned_to: 'ALPHA' // Truth/Strategy Squad (Torch, Veritas, GCM)
    },

    // --- SYSTEM IMPROVEMENT & LEARNING ---
    {
        title: '[EVOLUTION] [DEV] MCP Tool Discoverability Audit',
        description: 'Analyze all registered MCP tool schemas (search_repositories, browse_page, etc). \n\nDirectives:\n1. Identify missing capabilities or ambiguous descriptions.\n2. Propose 3 new MCP tools that would increase swarm efficiency.\n3. Artifact: MCP_Evolution_Proposal.md',
        task_type: 'research',
        priority: 7,
        assigned_to: 'GAMMA'
    },
    {
        title: '[EVOLUTION] [STRATEGY] Autonomous Mission Generation',
        description: 'Based on recent failures and successes, draft 5 new "Mission Templates" for the next 24-hour cycle. \n\nDirectives:\n1. Focus on self-sustaining loops (test -> fix -> verify).\n2. Design tasks that require collaboration between at least 2 agents.\n3. Artifact: Autonomous_Mission_Roadmap.md',
        task_type: 'planning',
        priority: 6,
        assigned_to: 'ALPHA'
    }
];

async function seedAutonomousEvolution() {
    console.log('🚀 SEEDING [AUTONOMOUS EVOLUTION] MISSIONS...');

    const { error } = await supabase.from('trinity_tasks').insert(
        AUTONOMOUS_MISSIONS.map(m => ({
            ...m,
            status: 'pending',
            created_at: new Date().toISOString(),
            metadata: {
                mission_id: 'AUTONOMOUS_EVOLUTION_V1',
                evolution_tier: 'BETA-SWARM',
                requires_peer_review: true,
                autonomous_trigger: true
            }
        }))
    );

    if (error) {
        console.error('❌ Seeding failed:', error.message);
    } else {
        console.log(`✅ Successfully seeded ${AUTONOMOUS_MISSIONS.length} evolutionary missions.`);
        console.log('🌌 The swarm is now tasked with self-healing and peer optimization.');
    }
}

seedAutonomousEvolution();
