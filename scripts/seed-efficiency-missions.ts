
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const EFFICIENCY_MISSIONS = [
    {
        title: '[EFFICIENCY] [SCOUT] Research Open-Source n8n Alternatives',
        description: 'Use EfficiencyMCP and Brave Search to find the top 3 open-source alternatives to n8n that can be self-hosted on Railway with low resource footprint. \n\nDirectives:\n1. Compare features, resource usage, and community support.\n2. Perform ROI analysis if switching from a paid n8n instance.\n3. Artifact: n8n_Efficiency_Report.md',
        task_type: 'research',
        priority: 80,
        assigned_to: 'trinity-sophia'
    },
    {
        title: '[EFFICIENCY] [AUDIT] Intelligence Router Cost Simulation',
        description: 'Simulate a budget hit in the swarm memory (Redis) and verify if the IntelligenceRouter correctly falls back to ECONOMY tier models (DeepSeek, siliconflow-qwen). \n\nDirectives:\n1. Check logs for "ECONOMY MODE" activation.\n2. Verify that expensive providers (GPT-4) are nerfed.\n3. Artifact: Cost_Fallback_Validation.md',
        task_type: 'audit',
        priority: 90,
        assigned_to: 'trinity-orch'
    },
    {
        title: '[EFFICIENCY] [DESIGN] Unified SLM Brain Instance',
        description: 'Propose a design for a single "Local Brain" instance using a Small Language Model (SLM) like Qwen-2.5-Coder-7B to handle all basic tool routing, saving on ELITE token spend.',
        task_type: 'design',
        priority: 70,
        assigned_to: 'trinity-hdm'
    }
];

async function seedEfficiency() {
    console.log('🚀 Seeding EFFICIENCY missions...');

    for (const mission of EFFICIENCY_MISSIONS) {
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

    console.log('🏁 Efficiency seeding complete.');
}

seedEfficiency();
