
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

// Setup Supabase with Anon Key (verified working)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';

const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_SCENARIOS = [
    {
        name: 'trinity-torch',
        suggestion: "Optimize research latency by batching search queries. Prioritize depth over speed.",
        confidence: 0.89
    },
    {
        name: 'trinity-nexus',
        suggestion: "Increase resource allocation for Context Window. User engagement is high.",
        confidence: 0.95
    },
    {
        name: 'trinity-mel',
        suggestion: "Refactor code output to favor TypeScript interfaces over Types. Strict mode recommended.",
        confidence: 0.76
    },
    {
        name: 'trinity-sophi', // Intentional typo test or new agent
        suggestion: "Analyze emotional sentiment in user logs. Detect frustration markers.",
        confidence: 0.92
    }
];

async function populateInbox() {
    console.log("🚀 Populating ANFIS Inbox for UX Testing...");

    for (const scenario of TEST_SCENARIOS) {
        console.log(`🤖 Processing ${scenario.name}...`);

        // 1. Ensure Agent Exists
        await supabase.from('trinity_agent_registry').upsert({
            agent_name: scenario.name,
            status: 'working',
            current_tier: 'Grow',
            reputation_score: Math.floor(Math.random() * 40) + 60, // 60-100
            tasks_completed: Math.floor(Math.random() * 100),
            tasks_failed: 0
        }, { onConflict: 'agent_name' });

        // 2. Inject Suggestion
        const { error } = await supabase
            .from('trinity_agent_registry')
            .update({
                suggested_prompt: scenario.suggestion,
                suggestion_confidence: scenario.confidence,
                suggestion_accepted: false, // Reset
                directive_source: 'fallback' // Reset
            })
            .eq('agent_name', scenario.name);

        if (error) {
            console.error(`❌ Failed to inject for ${scenario.name}:`, error.message);
        } else {
            console.log(`✅ Suggestion injected for ${scenario.name}`);
        }
    }

    console.log("\n✨ Inbox Populated! Go to http://localhost:3000/pulse/wisdom");
}

populateInbox().catch(console.error);
