const { createClient } = require('@supabase/supabase-js');
const url = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTkzOTU5MSwiZXhwIjoyMDY3NTE1NTkxfQ.4ADAiDK-CD6Jk5_JgizadriWVBoYg42NnsKsbcQ0h6A';
const sb = createClient(url, key);

async function run() {
    const { data: cols, error: err } = await sb.from('trinity_tasks').select('*').limit(1);
    const keys = cols && cols.length > 0 ? Object.keys(cols[0]) : ['title', 'description', 'status', 'priority', 'assigned_token', 'agent_name'];
    console.log("SCHEMA KEYS DETECTED:", keys);

    const agentKey = keys.includes('assigned_agent') ? 'assigned_agent' : (keys.includes('agent_name') ? 'agent_name' : 'creator_agent');
    
    // We will assign them. For robustness, if 'assigned_agent' isn't there, we just omit it or guess based on schema.
    const tasks = [
        { title: '[TORCH] Task A: Write complete demo video script', description: 'Write complete demo video script. Format: [TIMESTAMP] [PANEL] [EXACT WORDS]. 3-5 minutes, 3 acts. Act 1: The fake hash incident story. Act 2: Live demo walkthrough of 5 panels. Act 3: TrustShell — one npm install. Word count 600-900.', status: 'pending', priority: 5 },
        { title: '[TORCH] Task B: Write 3 LinkedIn posts (A/B/C variants)', description: 'Write 3 LinkedIn posts. A: Story — the fake hash incident. B: Provocative — AI liability question. C: Mission — Micah 6:8. Max 150 words each.', status: 'pending', priority: 5 },
        { title: '[NEXUS] Task C: Competitive intelligence', description: 'Search LabLab.ai × Surge public submissions. Save to competitive_intelligence table with project_name, erc8004_used, x402_used, completion_level, source_url.', status: 'pending', priority: 5 },
        { title: '[NEXUS] Task D: Research LiteLLM production deployments', description: 'Find known failure modes, rate limit handling, best Railway deployment configs. Store in sprint_reports field: litellm_research.', status: 'pending', priority: 5 },
        { title: '[VERITAS] Task E: 500 hallucination injection tests', description: 'Run test harness scripts/test-hallucination-detection.ts. Target >85% overall catch rate.', status: 'pending', priority: 5 },
        { title: '[SHOFET] Task E(2): Assist 500 hallucination tests', description: 'Assist VERITAS.', status: 'pending', priority: 5 },
        { title: '[GCM] Task F: TrustShell developer outreach', description: 'Find 20 developers building with LangChain/AutoGPT/CrewAI. Save to linkedin_content_queue.', status: 'pending', priority: 5 },
        { title: '[MEL] Task G: HITL scenario templates', description: 'Create 10 scenarios with full transparent context (trigger_condition, context_to_show, bayesian_score, recommendation, options).', status: 'pending', priority: 5 },
        { title: '[APM] Task H: Provider cost baseline', description: 'Query provider_usage_log for last 7 days. Calculate cost per task per provider.', status: 'pending', priority: 5 }
    ];

    for (let t of tasks) {
        t[agentKey] = t.title.split(']')[0].replace('[', ''); // Extract agent name
    }

    const { data: iData, error: iErr } = await sb.from('trinity_tasks').insert(tasks).select();
    if (iErr) {
        console.error('INSERT ERROR:', iErr);
    } else {
        console.log(`SUCCESSFULLY INSERTED ${iData.length} OVERNIGHT TASKS!`);
    }
}
run();
