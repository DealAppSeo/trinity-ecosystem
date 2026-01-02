
import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent';
import { GCM } from '../lib/agent/GCM';

// Set env vars manually for local test without .env file
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';
// process.env.OPENAI_API_KEY = 'sk-...' // User can uncomment and add key if needed

async function runCallback() {
    console.log('🤖 Starting Trinity Swarm Simulation...');

    // 1. Core Agents Reflect
    const agentNames = ['APM', 'HDM', 'MEL']; // Reduced set for speed
    for (const name of agentNames) {
        const agent = new ConstitutionalAgent({ name });
        console.log(`\n[${name}] Reflecting...`);
        await agent.retrospective();
    }

    // 2. GCM Analyzes
    console.log('\n[GCM] Starting Governance Cycle...');
    const gcm = new GCM();
    await gcm.retrospective(); // GCM needs to reflect too
    await gcm.identifySkillGaps();

    console.log('\n✅ Swarm Cycle Complete.');
}

runCallback().catch(console.error);
