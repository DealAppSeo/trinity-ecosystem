import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Credentials injection if missing
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(url, key);

const PROGRESSIVE_TASKS = [
    {
        title: "[EVERGREEN] Intelligence P1: Autonomous Agent Market Analysis",
        description: `
OBJECTIVE: Conduct high-depth market research on AI Agent Marketplaces.
STEPS:
1. Use 'search_web' tool (Tavily) to find 3 major developments in AI agent economy from the last 30 days.
2. Focus on "monetization of autonomous workloads".
3. Write a 4-section report: Trends, Major Players, Economic Inhibitors, and Trinity Opportunities.
4. ARTIFACT: Save to 'artifacts/intelligence/agent_market_analysis.md' using FileSystemMCP.
5. SUCCESS CRITERIA: Report must be > 400 words and include at least 2 competitive citations.
6. COMPLETION: Once artifact is saved, return a summary of findings.
`,
        assigned_to: "trinity-mel",
        priority: 8,
        task_type: "research",
        requires_consensus: true,
        metadata: {
            workflow: "research -> artifact -> verification",
            tools_required: ["search_web", "write_file"],
            expected_folder: "artifacts/intelligence"
        }
    },
    {
        title: "[EVERGREEN] Infrastructure P1: FileSystemMCP Stress & Proof Test",
        description: `
OBJECTIVE: Verify local artifact persistence and RepID signing integrity.
STEPS:
1. Use 'write_file' to create 'artifacts/audit/proof_of_life.txt' with a unique timestamp and "Trinity Signature".
2. Use 'read_file' to confirm the content matches perfectly.
3. List all files in 'artifacts/intelligence' to verify MEL's output is visible.
4. ARTIFACT: Generate 'artifacts/audit/fs_integrity_report.md' detailing latency and success of these ops.
5. SUCCESS CRITERIA: 100% read/write match.
6. COMPLETION: Log result and verify peer artifacts are present.
`,
        assigned_to: "trinity-veritas",
        priority: 7,
        task_type: "infrastructure",
        requires_consensus: true,
        metadata: {
            workflow: "audit -> verification -> loop",
            tools_required: ["write_file", "read_file", "list_files"]
        }
    },
    {
        title: "[EVERGREEN] Wisdom P1: The Ethics of Digital Sovereignty",
        description: `
OBJECTIVE: Synthesize a philosophical cornerstone for the Trinity Brand.
STEPS:
1. Reflect on the "Constitutional Principle of Human Centrality".
2. Draft a "Wisdom Pulse" regarding how AI swarms should handle user private data.
3. Contrast "Corporate Harvesting" vs "Trinity Stewardship".
4. ARTIFACT: Save to 'artifacts/wisdom/sovereignty_manifesto.md'.
5. SUCCESS CRITERIA: Must include a "Virtue Commitment" section.
6. COMPLETION: Once verified, this becomes a brand asset.
`,
        assigned_to: "trinity-sophia",
        priority: 6,
        task_type: "content",
        requires_consensus: true,
        metadata: {
            workflow: "synthesis -> artifact -> brand_asset"
        }
    },
    {
        title: "[EVERGREEN] Science P1: GNN Trust Factor Calibration",
        description: `
OBJECTIVE: Analyze reputation data and proposed trust scaling formulas.
STEPS:
1. Use 'search_web' to research "Recursive Trust Propagation in Multi-Agent Graphs".
2. Propose a formula (Latex or Code) for how RepID should scale after 100 successful missions.
3. ARTIFACT: Save to 'artifacts/science/trust_calibration_v1.md'.
4. SUCCESS CRITERIA: Formula must handle "Sybil Attack Prevention".
`,
        assigned_to: "trinity-hdm",
        priority: 7,
        task_type: "analysis",
        requires_consensus: true,
        metadata: {
            workflow: "research -> math -> spec"
        }
    }
];

async function seed() {
    console.log('--- [TRINITY PROGRESSIVE SEEDER] ---');
    console.log('Clearing old pending tasks to ensure clean boot...');

    // Optional: Clear old tasks to avoid clutter, or just append
    // await supabase.from('trinity_tasks').delete().eq('status', 'pending');

    console.log('Seeding 4 High-Detail Progressive Tasks...');

    const { error } = await supabase
        .from('trinity_tasks')
        .insert(PROGRESSIVE_TASKS.map(t => ({
            ...t,
            status: 'pending',
            created_at: new Date().toISOString()
        })));

    if (error) {
        console.error('❌ Seeding failed:', error.message);
    } else {
        console.log('✅ Successfully seeded the elite progressive loop.');
    }
}

seed();
