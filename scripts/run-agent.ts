import 'dotenv/config';
import path from 'path';
// Ensure .env.local is also loaded if the default config didn't pick it up (dotenv/config usually loads .env)
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// FORCE CREDENTIALS if missing (Bypassing dotenv issues)
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.log("⚠️ Injecting Hardcoded Supabase Credentials...");
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';
    process.env.SUPABASE_SERVICE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // Fallback to Anon if Service not available
}

import http, { IncomingMessage, ServerResponse } from 'http';

const agentName = process.argv[2];

if (!agentName) {
    console.error("❌ Usage: npx tsx scripts/run-agent.ts <AGENT_NAME>");
    process.exit(1);
}

// Name Normalization (Map Short -> Full)
const AGENT_MAP: Record<string, string> = {
    'APM': 'trinity-apm',
    'GCM': 'trinity-gcm',
    'HDM': 'trinity-hdm',
    'MEL': 'trinity-mel',
    'NEXUS': 'trinity-nexus',
    'TORCH': 'trinity-torch',
    'VERITAS': 'trinity-veritas',
    'CHESED': 'trinity-chesed',
    'SOPHIA': 'trinity-sophia',
    'W3C': 'trinity-w3c'
};

// Use mapped name or fallback to arg (handle case where user already provided full name)
const normalizedName = AGENT_MAP[agentName.toUpperCase()] || (agentName.startsWith('trinity-') ? agentName : `trinity-${agentName.toLowerCase()}`);

console.log(`[INIT] Name Normalized: ${agentName} -> ${normalizedName}`);
const finalAgentName = normalizedName;

async function startAgent() {
    // DYNAMIC IMPORT TO ENSURE ENV VARS ARE LOADED FIRST
    const { ConstitutionalAgent } = await import('../lib/agent/ConstitutionalAgent');

    console.log(`🤖 Starting Agent: ${finalAgentName}...`);

    const agent = new ConstitutionalAgent({ name: finalAgentName });
    await agent.syncState();

    console.log(`✅ ${finalAgentName} is ONLINE (Tier: ${agent.autonomyTier}, Rep: ${agent.reputationScore})`);

    // START HTTP SERVER FOR RAILWAY/UPTIME ROBOT
    // Railway requires the app to listen on PORT (usually 3000)
    const port = process.env.PORT || 3000;

    const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
        if (req.url === '/health' || req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'online',
                agent: finalAgentName,
                time: new Date().toISOString()
            }));
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    server.listen(port, () => {
        console.log(`[${finalAgentName}] 🌍 Health Server listening on port ${port}`);
    });

    // START MAIN AGENT LOOP
    console.log(`[${finalAgentName}] 🚀 Starting Trinity Healing Loop...`);
    await agent.startTrinityHealingLoop();
}

startAgent().catch(err => {
    console.error(`💥 FATAL: Agent ${finalAgentName} crashed:`, err);
    process.exit(1);
});
