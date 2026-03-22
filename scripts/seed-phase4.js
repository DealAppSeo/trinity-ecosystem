const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const { execSync } = require('child_process');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const tasks = [
    {
        title: 'TORCH: Write video script using SHOFET coordinated attack results',
        description: 'SHOFET detected a coordinated false signal with dissent score 0.9. Write this into the demo video script as Act 2 Panel demonstration. Replace the generic BFT description with: our system detected two agents sending correlated false signals - the Pythagorean Comma veto fired with 90% dissent confidence. Update the script in task 141150 result field.',
        task_type: 'content_creation',
        status: 'pending',
        agent_name: 'trinity-torch',
        priority: 1,
        created_at: new Date().toISOString()
    },
    {
        title: 'NEXUS: Find 3 real competitors entering March 30 hackathon',
        description: 'Search LabLab.ai for teams already registered for the March 30 ERC-8004 trading agents hackathon. Find their GitHub repos if public. For each: what are they building, do they have live contracts, what is their trust/verification approach. Trinity needs to know who we are up against. Store findings in result field.',
        task_type: 'research',
        status: 'pending',
        agent_name: 'trinity-nexus',
        priority: 1,
        created_at: new Date().toISOString()
    },
    {
        title: 'VERITAS: Run 10 verification tests using direct provider call',
        description: 'After Gemini deploys the constitutional override bypass, run 10 hallucination_detection tasks through the new direct callOpenAICompatible path. For each: log the raw LLM response, the parsed result, and whether error_found matched expectations. Store full test log in result field. This is the ground truth validation of Phase 2.',
        task_type: 'testing',
        status: 'pending',
        agent_name: 'trinity-veritas',
        priority: 2,
        created_at: new Date().toISOString()
    },
    {
        title: 'MEL: Calculate optimal BFT threshold from all historical data',
        description: 'Query ALL trinity_tasks WHERE belief IS NOT NULL. Build distribution: how many tasks have belief 0.0-0.1, 0.1-0.2... 0.9-1.0? Same for disbelief. Where is the natural separation between caught and missed? What threshold would maximize catch rate while minimizing false positives? Store distribution analysis and threshold recommendation in result field.',
        task_type: 'analysis',
        status: 'pending',
        agent_name: 'trinity-mel',
        priority: 1,
        created_at: new Date().toISOString()
    },
    {
        title: 'APM: Build provider cost and performance scorecard',
        description: 'Query trinity_agent_logs for all LLM calls in last 48 hours. For each provider: count calls, estimate cost, calculate average response quality score if available. Which provider gives best value for verification tasks specifically? Store scorecard in result field. This feeds ANFIS routing optimization.',
        task_type: 'analysis',
        status: 'pending',
        agent_name: 'trinity-apm',
        priority: 1,
        created_at: new Date().toISOString()
    },
    {
        title: 'GCM: Draft TrustShell developer announcement post',
        description: 'Write a LinkedIn announcement for @hyperdag/trustshell. Frame it as: we built the trust layer that caught our own AI lying. Now you can add that same protection to your agent in one npm install. Include: the fake hash story, what TrustShell provides, link to trustshell.dev. Max 200 words. Store in result field.',
        task_type: 'content_creation',
        status: 'pending',
        agent_name: 'trinity-gcm',
        priority: 1,
        created_at: new Date().toISOString()
    },
    {
        title: 'SOPHIA: Design trust-gated x402 payment flow',
        description: 'Based on NEXUS research: design the complete flow for a trust-gated agent payment. Agent A wants to pay Agent B via x402. Before payment: 1) query ERC-8004 for Agent B identity, 2) check RepID score against threshold, 3) if approved emit x402 payment, 4) log to trinity_agent_logs. Write the TypeScript pseudocode for this flow. This is the March 30 demo feature. Store in result field.',
        task_type: 'planning',
        status: 'pending',
        agent_name: 'trinity-sophia',
        priority: 1,
        created_at: new Date().toISOString()
    },
    {
        title: 'HDM: Create TrustShell quickstart tutorial',
        description: 'Write a 5-minute quickstart tutorial for developers. Show: 1) npm install @hyperdag/trustshell, 2) wrap an existing OpenAI agent call with TrustShell, 3) what the output looks like with trust scores added, 4) how to check RepID on BaseScan. Use simple before/after code examples. Store in result field.',
        task_type: 'content_creation',
        status: 'pending',
        agent_name: 'trinity-hdm',
        priority: 1,
        created_at: new Date().toISOString()
    }
];

async function seedPhase4() {
    console.log("[SEED] Inserting 8 Phase 4 agent tasks...");
    const { error } = await supabase.from('trinity_tasks').insert(tasks);
    if (error) {
        console.error("[SEED] Error inserting tasks:", error);
    } else {
        console.log("[SEED] Successfully seeded 8 tasks into trinity_tasks.");
        execSync('node scripts/tg.js "📋 Phase 4 done — 8 new agent tasks seeded in trinity_tasks"');
    }
}

seedPhase4();
