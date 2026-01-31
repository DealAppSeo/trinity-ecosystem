
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function seedMissions() {
    console.log('🚀 Seeding High-Quality Missions...');

    const missions = [
        // DESIGN
        {
            title: '[DESIGN] Mobile-First Navigation Mockup',
            description: 'Design a glassmorphism bottom navigation bar for the Trinity mobile app. Include icons for Dashboard, Tasks, and Artifacts. Ensure HSL-tailored colors.',
            task_type: 'design',
            priority: 95,
            status: 'pending'
        },
        {
            title: '[DESIGN] Agent Persona Avatars (SVG)',
            description: 'Create unique SVG geometric patterns for the 12 agents (MEL, TORCH, etc.) based on their wisdom profiles. Focus on sacred geometry.',
            task_type: 'design',
            priority: 85,
            status: 'pending'
        },
        // CODE
        {
            title: '[CODE] Implement Artifact Verification Pipeline',
            description: 'Develop a serverless function that automatically triggers a peer-review task when a new artifact is saved in Supabase. Ensure BFT compliance.',
            task_type: 'code',
            priority: 90,
            status: 'pending'
        },
        {
            title: '[CODE] Real-time Cost Ticker Hook',
            description: 'Refactor the CostTicker into a reusable React hook that subscribes to the trinity_costs table for sub-second updates.',
            task_type: 'code',
            priority: 80,
            status: 'pending'
        },
        // CONTENT / RESEARCH
        {
            title: '[RESEARCH] Constitutional AI Ethics Audit',
            description: 'Analyze current swarm behavior against the Trinity Constitution. Identify any deviations in Virtue values during task execution.',
            task_type: 'research',
            priority: 75,
            status: 'pending'
        },
        // SIMPLE / TEST
        {
            title: '[TEST] Swarm Connectivity Ping',
            description: 'Perform a simple health check across all 4 squads. Agents should respond with their current system occupancy %.',
            task_type: 'genesis',
            priority: 10,
            status: 'pending'
        }
    ];

    const { error } = await supabase.from('trinity_tasks').insert(missions);

    if (error) {
        console.error('❌ Failed to seed missions:', error.message);
    } else {
        console.log('✅ Successfully seeded 6 high-priority diverse missions.');
    }

    // Deprioritize old investigate tasks
    const { error: deprioError } = await supabase
        .from('trinity_tasks')
        .update({ priority: 30 })
        .ilike('title', '%[ANTIFRAGILE]%')
        .eq('status', 'pending');

    if (deprioError) console.warn('Warning: Could not deprioritize old tasks:', deprioError.message);
}

seedMissions();
