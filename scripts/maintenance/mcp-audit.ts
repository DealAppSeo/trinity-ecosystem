
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { mcpManager } from '../lib/mcp/MCPManager';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function auditSwarmTools() {
    console.log("🛠️  [MCP AUDIT] Commencing Swarm Tool Integrity Check...");

    // 1. Initialize all servers
    await mcpManager.initializeAll();

    // 2. Get status of all servers
    const status = await mcpManager.getStatus();
    console.log("\n--- MCP SERVER STATUS ---");
    status.forEach(s => {
        const icon = s.status === 'connected' ? '✅' : '❌';
        console.log(`${icon} [${s.name}] - Status: ${s.status} | Tools: ${s.tools_count}`);
    });

    // 3. List all tools
    const allTools = await mcpManager.listTools();
    console.log(`\n📦 TOTAL UNIQUE TOOLS DISCOVERED: ${allTools.length}`);

    // 4. Test a few critical tools (optional simulation)
    const criticalServers = ['FileSystem', 'Supabase', 'TavilySearch'];
    const missing = criticalServers.filter(name => !status.some(s => s.name === name && s.status === 'connected'));

    if (missing.length > 0) {
        console.error(`\n⚠️  CRITICAL SERVERS MISSING: ${missing.join(', ')}`);
    } else {
        console.log("\n✅ ALL CRITICAL INFRASTRUCTURE SERVERS ARE ONLINE.");
    }

    console.log("\nAudit complete.");
    process.exit(0);
}

auditSwarmTools();
