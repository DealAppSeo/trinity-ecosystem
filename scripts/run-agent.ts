import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// FORCE CREDENTIALS if missing (Bypassing dotenv issues)
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.log("⚠️ Injecting Hardcoded Supabase Credentials...");
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';
    process.env.SUPABASE_SERVICE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // Fallback to Anon if Service not available
}
import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent';
import http, { IncomingMessage, ServerResponse } from 'http'; // Added import for http and types

const agentName = process.argv[2];

if (!agentName) {
    console.error("❌ Usage: ts-node scripts/run-agent.ts <AGENT_NAME>");
    process.exit(1);
}

async function startAgent() {
    console.log(`🤖 Starting Agent: ${agentName}...`);

    const agent = new ConstitutionalAgent({ name: agentName });
    await agent.syncState();

    console.log(`✅ ${agentName} is ONLINE (Tier: ${agent.autonomyTier}, Rep: ${agent.reputationScore})`);

    // START HTTP SERVER FOR RAILWAY/UPTIME ROBOT
    // Railway requires the app to listen on PORT (usually 3000)
    const port = process.env.PORT || 3000;

    const server = http.createServer((req: IncomingMessage, res: ServerResponse) => { // Fixed types
        if (req.url === '/health' || req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'online',
                agent: agentName,
                uptime: process.uptime()
            }));
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    server.listen(port, () => {
        console.log(`[${agentName}] 🌍 Health Server listening on port ${port}`);
    });

    // START MAIN AGENT LOOP
    // This will run forever, checking tasks and sending heartbeats to Supabase
    console.log(`[${agentName}] 🚀 Starting Trinity Healing Loop...`);
    await agent.startTrinityHealingLoop();
}

startAgent().catch(err => {
    console.error(`💥 FATAL: Agent ${agentName} crashed:`, err);
    process.exit(1);
});
