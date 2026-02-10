
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const PHASE8_MISSIONS = [
    {
        title: '[PHASE 8] [SCOUT] Evaluate Tool Toolkit: Arxiv, Bacalhau, Penpot, Stability, A2A',
        description: 'Research and evaluate the proposed Phase 8 toolkit. \n\nDirectives:\n1. Audit Arxiv integration in ResearchMCP and propose expansion for full PDF context.\n2. Evaluate Bacalhau for distributed compute vs. E2B or Golem.\n3. Verify Penpot MCP Server capabilities for UI/UX automation vs. Figma.\n4. Research A2A protocol (Google/Linux Foundation) for direct swarm-to-swarm communication.\n5. Compare Stability.ai vs. Flux.1 and Midjourney for creative tasks.\n6. Artifact: Phase8_Tool_Scouting_Report.md',
        task_type: 'research',
        priority: 95,
        assigned_to: 'trinity-sophia'
    }
];

async function seedPhase8() {
    console.log('🚀 Seeding PHASE 8 scouting missions...');

    for (const mission of PHASE8_MISSIONS) {
        const { data, error } = await supabase
            .from('trinity_tasks')
            .insert([{
                ...mission,
                status: 'pending',
                created_at: new Date().toISOString()
            }]);

        if (error) {
            console.error(`❌ Error seeding ${mission.title}:`, error.message);
        } else {
            console.log(`✅ Seeded: ${mission.title}`);
        }
    }

    console.log('🏁 Phase 8 seeding complete.');
}

seedPhase8();
