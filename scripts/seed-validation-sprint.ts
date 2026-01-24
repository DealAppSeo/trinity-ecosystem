import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TASKS = [
    // ALPHA SQUAD (Research & Logic)
    {
        title: "[ALPHA] [EASY] Repository Structure Audit",
        description: "Explore the root directory and map the primary structure. Identify the purpose of /packages, /lib, and /scripts.",
        task_type: "research",
        assigned_to: "ALPHA",
        priority: 1
    },
    {
        title: "[ALPHA] [MEDIUM] ZK-SNARK Gap Analysis",
        description: "Research 2026 ZK-SNARK implementations for privacy-preserving reputation. Compare snarkjs and circom performance.",
        task_type: "research",
        assigned_to: "ALPHA",
        priority: 2
    },
    {
        title: "[ALPHA] [EASY] Dependency Conflict Check",
        description: "List all major dependencies in package.json and flag any potential version mismatches between workspaces.",
        task_type: "research",
        assigned_to: "ALPHA",
        priority: 1
    },
    {
        title: "[ALPHA] [MEDIUM] Artifact MIME-Type Protocol",
        description: "Propose a standardized MIME-type mapping for trinity artifacts (e.g., .mermaid, .csv, .md).",
        task_type: "research",
        assigned_to: "ALPHA",
        priority: 2
    },

    // BETA SQUAD (Data & Spreadsheet)
    {
        title: "[BETA] [EASY] Agent Latency Table",
        description: "Audit the trinity_agent_registry and create a CSV-style table of agents with their current last_active latency.",
        task_type: "code",
        assigned_to: "BETA",
        priority: 1
    },
    {
        title: "[BETA] [MEDIUM] Performance Benchmark CSV",
        description: "Create a structured CSV artifact comparing throughput and latency for the current 4 status database tables.",
        task_type: "code",
        assigned_to: "BETA",
        priority: 2
    },
    {
        title: "[BETA] [EASY] Suppabase Table Definition Audit",
        description: "List all columns in the 'trinity_tasks' table and identify unused or legacy fields.",
        task_type: "code",
        assigned_to: "BETA",
        priority: 1
    },
    {
        title: "[BETA] [MEDIUM] Data Retention Policy Proprosal",
        description: "Draft a spreadsheet-style artifact outlining a 30-day automated cleanup policy for old heartbeats and logs.",
        task_type: "code",
        assigned_to: "BETA",
        priority: 2
    },

    // GAMMA SQUAD (Design & Architecture)
    {
        title: "[GAMMA] [EASY] Squad Vision Statement",
        description: "Draft a concise 1-paragraph mission statement for the Gamma squad's role in the Trinity Symphony.",
        task_type: "research",
        assigned_to: "GAMMA",
        priority: 1
    },
    {
        title: "[GAMMA] [MEDIUM] Task Lifecycle Diagram",
        description: "Create a Mermaid flowchart diagram showing a task moving from PENDING to DOING to DONE to VERIFIED.",
        task_type: "research",
        assigned_to: "GAMMA",
        priority: 2
    },
    {
        title: "[GAMMA] [EASY] Dashboard Component Audit",
        description: "List all UI components in /components and identify which ones are currently used in the main Dashboard page.",
        task_type: "research",
        assigned_to: "GAMMA",
        priority: 1
    },
    {
        title: "[GAMMA] [MEDIUM] HyperDag Connectivity Mock",
        description: "Propose a design for a 'Graph Connector' artifact that shows how a task would link to a ZKP proof on-chain.",
        task_type: "research",
        assigned_to: "GAMMA",
        priority: 2
    },

    // ORCHESTRATION (Coordination & Docs)
    {
        title: "[ORCH] [EASY] Swarm Manifesto Init",
        description: "Kick off the 'Trinity Manifesto' draft with a high-level focus on 'Antifragility and Emergence'.",
        task_type: "research",
        assigned_to: "ORCH",
        priority: 1
    },
    {
        title: "[ORCH] [MEDIUM] Cross-Squad Handoff Protocol",
        description: "Draft a document outlining how Level 1 tasks should hand off to Level 2 tasks across squads.",
        task_type: "research",
        assigned_to: "ORCH",
        priority: 2
    },
    {
        title: "[ORCH] [MEDIUM] Collaboration Test Case: Hidden Key",
        description: "CLARIFICATION TEST: Find the 'hidden' key description in the codebase. (Purposefully ambiguous task to trigger Clarify).",
        task_type: "research",
        assigned_to: "ORCH",
        status: "pending_clarification",
        priority: 3
    },
    {
        title: "[ORCH] [MEDIUM] Global Directive Sync Plan",
        description: "Propose a strategy for ensuring that all 12 agents receive 'Planetary Directives' simultaneously without polling collisions.",
        task_type: "research",
        assigned_to: "ORCH",
        priority: 2
    },

    // ADDITIONAL FOR VOLUME (24 Total)
    { title: "[ALPHA] [EASY] FileSystemMCP Tool Audit", description: "List all tools provided by the FileSystemMCP and verify they are correctly registered.", task_type: "research", assigned_to: "ALPHA", priority: 1 },
    { title: "[ALPHA] [MEDIUM] GitHub MCP Repo Integration", description: "Audit the current GitHubMCP and propose 3 new tools for better PR management.", task_type: "research", assigned_to: "ALPHA", priority: 2 },
    { title: "[BETA] [EASY] Artifact Scaling Test Doc", description: "Propose a strategy for handling > 10,000 artifacts in the Trinity Dashboard UI.", task_type: "code", assigned_to: "BETA", priority: 1 },
    { title: "[BETA] [MEDIUM] Log Aggregation Table", description: "Create a pivot-table artifact summarizing the frequency of errors across all 12 agents.", task_type: "code", assigned_to: "BETA", priority: 2 },
    { title: "[GAMMA] [EASY] Iconography Standard", description: "List the Lucide icons currently used in the Registry Grid and propose any missing metaphors.", task_type: "research", assigned_to: "GAMMA", priority: 1 },
    { title: "[GAMMA] [MEDIUM] Responsive Grid Design Proprosal", description: "Draft a CSS-focused artifact proposing a layout for a 24-agent mobile grid.", task_type: "research", assigned_to: "GAMMA", priority: 2 },
    { title: "[ORCH] [EASY] Uptime Pulse Protocol", description: "Summarize the current wake-monitor.ts logic and identify its primary fail-points.", task_type: "research", assigned_to: "ORCH", priority: 1 },
    { title: "[ORCH] [MEDIUM] Planetary Restart Guide", description: "Create a 1-page technical guide for manually restarting the entire swarm in Railway.", task_type: "research", assigned_to: "ORCH", priority: 2 }
];

async function seedValidationSprint() {
    console.log('🌱 SEEDING SWARM VALIDATION SPRINT (24 Tasks)...');

    const { error } = await supabase
        .from('trinity_tasks')
        .insert(TASKS.map(t => ({
            ...t,
            status: t.status || 'pending',
            created_at: new Date().toISOString(),
            metadata: { sprint: 'VALIDATION_V1', complexity: t.priority > 1 ? 'medium' : 'easy' }
        })));

    if (error) console.error('❌ Seeding failed:', error.message);
    else console.log('✅ 24 Validation Tasks Seeded Successfully!');
}

seedValidationSprint();
