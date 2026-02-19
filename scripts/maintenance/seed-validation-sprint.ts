import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const SPRINT_TASKS = [
    // GAMMA SQUAD: PLANNER ROLE (Architecture & Testing)
    {
        title: "[GAMMA] [PRO] Infrastructure Planning: Swarm Telemetry",
        description: "Explore the library structure using GitHub.get_repo_tree. Identify state management in /lib/state. Use PlaywrightExpert.plan_test_scenario to draft a Markdown plan for a 'Global Heartbeat' verification spec.",
        task_type: "research",
        assigned_to: "GAMMA",
        priority: 100,
        requires_external_artifact: true
    },
    {
        title: "[GAMMA] [EASY] Repo Map Artifact",
        description: "Output a visual/Markdown map of the /lib and /packages directories using your recursive tree tools.",
        task_type: "research",
        assigned_to: "GAMMA",
        priority: 50,
        requires_external_artifact: true
    },

    // BETA SQUAD: GENERATOR ROLE (Creative & UI)
    {
        title: "[BETA] [PRO] Stability AI: Dashboard Vision 2026",
        description: "Generate a high-fidelity 'glassmorphism' UI mockup for the Trinity Controller. Use Stability.generate_image with these constraints: negative_prompt: 'text, labels, blurry, distorted', seed: 42, style: 'ultra-realistic cyberpunk minimalism'. Save to artifacts/creative.",
        task_type: "content",
        assigned_to: "BETA",
        priority: 100,
        requires_external_artifact: true
    },
    {
        title: "[BETA] [MEDIUM] Playwright Generator: UI Spec",
        description: "Analyze the current /pulse/tasks page using Playwright.browse_page. Use PlaywrightExpert.generate_test_suite to produce a basic .spec.ts checking that the 'Active Agents' count is visible.",
        task_type: "code",
        assigned_to: "BETA",
        priority: 70,
        requires_external_artifact: true
    },

    // ALPHA SQUAD: HEALER ROLE (Strategy & Audit)
    {
        title: "[ALPHA] [PRO] Self-Healing UI Audit",
        description: "Browse the site sandbox. If you encounter a 404 or a missing element on the login page, use PlaywrightExpert.heal_failing_test to propose a selector fix. Output the 'Healer Patch' as a document.",
        task_type: "meta",
        assigned_to: "ALPHA",
        priority: 100,
        requires_external_artifact: true
    },
    {
        title: "[ALPHA] [EASY] Truth Alignment Sync",
        description: "Verify that the agent roles in codebase match reality. Use Playwright.browse_page to check the 'Founders Dashboard' agent list and cross-reference with your memory.",
        task_type: "research",
        assigned_to: "ALPHA",
        priority: 50,
        requires_external_artifact: true
    }
];

async function seedSprint() {
    console.log('🚀 SEEDING PRO TOOL VALIDATION SPRINT...');

    // 1. Clear existing 'pending' tasks to avoid clutter if desired
    // (Optional: await supabase.from('trinity_tasks').delete().eq('status', 'pending'));

    const { error } = await supabase
        .from('trinity_tasks')
        .insert(SPRINT_TASKS.map(t => ({
            ...t,
            status: 'pending',
            created_at: new Date().toISOString(),
            metadata: {
                sprint: 'PRO_TOOL_VALIDATION',
                tools_tested: ['StabilityV2', 'GitHubTree', 'PlaywrightExpert']
            }
        })));

    if (error) {
        console.error('❌ Seeding failed:', error.message);
    } else {
        console.log('✅ 6 Pro Validation Tasks Seeded Successfully!');
        console.log('Run "npm run agent" or trigger your Railway swarm to begin.');
    }
}

seedSprint();
