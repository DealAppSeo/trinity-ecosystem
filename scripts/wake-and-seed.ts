
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function wakeAndSeed() {
    console.log('--- 🚀 Waking Agents & Seeding Tasks ---');

    // 1. Wake the Agents
    const agentsToWake = [
        'trinity-sophia', 'trinity-hdm', 'trinity-shofet', 'trinity-gcm',
        'trinity-veritas', 'trinity-w3c', 'trinity-apm', 'trinity-torch',
        'trinity-orch', 'trinity-mel', 'trinity-nexus', 'trinity-chesed',
        'trinity-ecosystem'
    ];

    console.log(`Setting ${agentsToWake.length} agents to 'online'...`);
    const { error: wakeError } = await supabase
        .from('trinity_agent_registry')
        .update({ status: 'online', last_active: new Date().toISOString() })
        .in('agent_name', agentsToWake);

    if (wakeError) {
        console.error('Error waking agents:', wakeError);
    } else {
        console.log('✅ Agents are now awake.');
    }

    // 2. Define Detailed Tasks
    const agentTasks = [
        {
            title: "Swarm Wisdom Pattern Audit",
            assigned_to: 'trinity-sophia',
            description: "[SOPHIA] Swarm Wisdom Pattern Audit: analyze previous task failures and 'doing' loops to identify recurring architecture blockers. Generate a Pattern Artifact for the swarm.",
            expected_output: "MD pattern report with at least 3 identified loops and proposed mitigation code snippets.",
            score: 80,
            is_real: true
        },
        {
            title: "HyperDAG Data Integrity Check",
            assigned_to: 'trinity-hdm',
            description: "[HDM] HyperDAG Data Integrity Check: audit the last 100 task entries for inconsistent metadata or duplicate IDs. Verify cross-references between trinity_tasks and trinity_artifacts.",
            expected_output: "Data integrity audit artifact with 'all clear' or specific ID mismatch report.",
            score: 85,
            is_real: true
        },
        {
            title: "Governance & Prompt Safety Review",
            assigned_to: 'trinity-shofet',
            description: "[SHOFET] Governance & Prompt Safety Compliancy Review: scan current agent system prompts in the registry for overreaching directives or security vulnerabilities.",
            expected_output: "Governance compliance report and proposed prompt hardening for at least 2 agents.",
            score: 90,
            is_real: true
        },
        {
            title: "Consensus Stress Test Visualization",
            assigned_to: 'trinity-gcm',
            description: "[GCM] Consensus Stress Test: Simulate a 3-agent disagreement on a mock verification and verify the BFT resolution logic. Generate a logic trace.",
            expected_output: "Consensus resolution artifact showing the decision tree and majority result.",
            score: 75,
            is_real: true
        },
        {
            title: "Artifact Quality Assurance",
            assigned_to: 'trinity-veritas',
            description: "[VERITAS] Artifact Quality Assurance: perform a deep audit of the 'Directives' and 'Artifacts' tables to ensure standard formatting and valid JSON schema.",
            expected_output: "QA report marking at least 5 recent artifacts as 'Verified' or 'Flagged'.",
            score: 85,
            is_real: true
        },
        {
            title: "Emerging SLM Benchmark Research",
            assigned_to: 'trinity-w3c',
            description: "[W3C] Research emerging Small Language Model (SLM) benchmarks for local execution (e.g., Llama-3-8B vs Phi-3). Propose a target model for edge expansion.",
            expected_output: "Comparative research artifact with latency/reasoning trade-offs.",
            score: 70,
            is_real: true
        },
        {
            title: "Ecosystem Performance Meta-Analysis",
            assigned_to: 'trinity-apm',
            description: "[APM] Ecosystem Performance Meta-Analysis: analyze heartbeat frequency and API response times across trinity-science. Identify the slowest endpoint.",
            expected_output: "Performance baseline report with identified bottlenecks.",
            score: 80,
            is_real: true
        },
        {
            title: "Compute Resource Optimization",
            assigned_to: 'trinity-torch',
            description: "[TORCH] Compute Resource Optimization: simulate a GPU allocation audit for the hypothetical TORCH cluster. Propose a scheduling priority for high-importance tasks.",
            expected_output: "Resource allocation strategy artifact.",
            score: 75,
            is_real: true
        },
        {
            title: "Scheduling Latency Identification",
            assigned_to: 'trinity-orch',
            description: "[ORCH] Scheduling Latency & Bottleneck Identification: analyze the time-to-claim for the last 50 tasks. Identify which squads are the most 'backlogged'.",
            expected_output: "Operational efficiency report for the swarm orchestrator.",
            score: 80,
            is_real: true
        },
        {
            title: "Empathy Engine Personalization Strategy",
            assigned_to: 'trinity-mel',
            description: "[MEL] Empathy Engine Personalization: refine the system prompt for MEL to handle 'Founder Frustration' cases. Generate a logic flow for de-escalation.",
            expected_output: "Revised MEL system prompt and empathetic interaction flow artifact.",
            score: 90,
            is_real: true
        },
        {
            title: "API Gateway Connectivity Test",
            assigned_to: 'trinity-nexus',
            description: "[NEXUS] API Gateway Health & Connectivity: verify all internal and external service endpoints listed in the audit script. Generate a connectivity map.",
            expected_output: "System connectivity artifact with latency heatmap.",
            score: 75,
            is_real: true
        },
        {
            title: "Ethics & Safety Interaction Audit",
            assigned_to: 'trinity-chesed',
            description: "[CHESED] Ethics & Safety Interaction Audit: review recent agent logs for any 'harmful' or 'out-of-character' responses. Ensure alignment with Triune BFT principles.",
            expected_output: "Safety audit report confirming 100% adherence or flagging violations.",
            score: 85,
            is_real: true
        }
    ];

    const evergreenTasks = [
        { title: "[EVERGREEN] Infrastructure Heartbeat Check", description: "Verify all agents are heartbeating at least once per 10 minutes.", priority: 8, status: 'pending', task_type: 'maintenance' },
        { title: "[EVERGREEN] Log Aggregation and Pattern Matching", description: "Cluster agent logs by error type and frequency.", priority: 5, status: 'pending', task_type: 'audit' },
        { title: "[EVERGREEN] Documentation Synchronization", description: "Verify all READMEs across the monorepo are up to date with the latest API changes.", priority: 3, status: 'pending', task_type: 'docs' },
        { title: "[EVERGREEN] Reputation Calibration", description: "Re-calculate reputation scores based on recent successful verifications.", priority: 6, status: 'pending', task_type: 'governance' },
        { title: "[EVERGREEN] Cost Analysis and Simulation", description: "Analyze token usage across different providers.", priority: 4, status: 'pending', task_type: 'metrics' },
        { title: "[EVERGREEN] Artifact Schema Evolution", description: "Propose next version of the artifact JSON schema.", priority: 5, status: 'pending', task_type: 'dev' },
        { title: "[EVERGREEN] Security Vulnerability Scan", description: "Run dependency-check on all monorepo packages.", priority: 9, status: 'pending', task_type: 'security' },
        { title: "[EVERGREEN] Agent Role Re-balancing", description: "Analyze squad workload and propose agent re-assignments.", priority: 5, status: 'pending', task_type: 'management' },
        { title: "[EVERGREEN] Public Pulse Mirroring", description: "Verify public dashboard accurately reflects current swarm state.", priority: 7, status: 'pending', task_type: 'verification' },
        { title: "[EVERGREEN] Database Index Optimization Audit", description: "Analyze query performance for the tasks and agents tables.", priority: 4, status: 'pending', task_type: 'db' },
        { title: "[EVERGREEN] UI Polish: Component Consistency Audit", description: "Check all cards and buttons for consistent glassmorphism effects.", priority: 2, status: 'pending', task_type: 'ui' },
        { title: "[EVERGREEN] Core Protocol: BFT Consensus Simulation", description: "Run a large-scale simulation of the consensus loop.", priority: 8, status: 'pending', task_type: 'research' }
    ].map(t => ({ ...t, is_evergreen: true, score: 50, is_real: true, use_acp: true, pipeline_stage: 1 }));

    console.log(`Inserting ${agentTasks.length} agent-specific tasks...`);
    const { error: agentTaskError } = await supabase
        .from('trinity_tasks')
        .insert(agentTasks.map(t => ({
            ...t,
            pipeline_stage: 1,
            use_acp: true,
            requires_consensus: t.assigned_to === 'GCM' || t.assigned_to === 'VERITAS'
        })));

    if (agentTaskError) {
        console.error('Error seeding agent tasks:', agentTaskError);
    } else {
        console.log('✅ Agent tasks seeded.');
    }

    console.log(`Inserting ${evergreenTasks.length} evergreen tasks...`);
    const { error: evergreenTaskError } = await supabase
        .from('trinity_tasks')
        .insert(evergreenTasks);

    if (evergreenTaskError) {
        console.error('Error seeding evergreen tasks:', evergreenTaskError);
    } else {
        console.log('✅ Evergreen tasks seeded.');
    }

    console.log('--- 🎉 Wake & Seed Complete ---');
}

wakeAndSeed();
