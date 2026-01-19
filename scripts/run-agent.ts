import * as dotenv from 'dotenv';
import path from 'path';

// 1. LOAD ENVIRONMENT IMMEDIATELY
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

// 2. FORCE CREDENTIALS if missing (Essential for preventing Mock Mode)
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.log("⚠️ Injecting Hardcoded Supabase Credentials...");
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';
}
// Ensure Service Role Key is available to prevent RLS blocks
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
    'W3C': 'trinity-w3c',
    'ORCH': 'trinity-orch',
    'SHOFET': 'trinity-shofet'
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
    // We favor process.env.PORT but allow a random fallback for local multi-agent boot.
    const finalPort = process.env.PORT ? parseInt(process.env.PORT) : (3100 + Math.floor(Math.random() * 1000));

    const server = http.createServer((req, res) => {
        if (req.url === '/health' || req.url === '/' || req.url === '/swarm-health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ONLINE',
                agent: finalAgentName,
                timestamp: new Date().toISOString(),
                version: '8.1.3-Antigravity',
                pillar: 'ImageBearer Phase 11',
                metrics: {
                    reputation: agent.reputationScore,
                    tier: agent.autonomyTier,
                    tasks_handled: agent.sessionMetrics?.tasksCompleted || 0
                }
            }));
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    server.listen(finalPort, '0.0.0.0', () => {
        console.log(`[${finalAgentName}] 🌍 Health Server listening on port ${finalPort} (/health)`);
    });

    // START MAIN AGENT LOOP
    console.log(`[${finalAgentName}] 🚀 Starting Trinity Healing Loop...`);
    await agent.startTrinityHealingLoop();
}

startAgent().catch(err => {
    console.error(`💥 FATAL: Agent ${finalAgentName} crashed:`, err);
    process.exit(1);
});
