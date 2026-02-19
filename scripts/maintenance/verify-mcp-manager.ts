
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { mcpManager } from '../lib/mcp/MCPManager';
import { AlphaVantageMCP } from '../lib/mcp/servers/AlphaVantageMCP';
import { FigmaMCP } from '../lib/mcp/servers/FigmaMCP';
import { GitHubMCP } from '../lib/mcp/servers/GitHubMCP';
import { GoogleWorkspaceMCP } from '../lib/mcp/servers/GoogleWorkspaceMCP';
import { PlaywrightMCP } from '../lib/mcp/servers/PlaywrightMCP';

async function verifyAll() {
    console.log("🚀 Starting MCP Manager Verification (Full Suite)...");

    // 1. Register Servers
    console.log("1️⃣ Registering Servers...");
    mcpManager.registerServer(new AlphaVantageMCP());
    mcpManager.registerServer(new FigmaMCP());
    mcpManager.registerServer(new GitHubMCP());
    mcpManager.registerServer(new GoogleWorkspaceMCP());
    mcpManager.registerServer(new PlaywrightMCP());

    // 2. Initialize
    console.log("2️⃣ Initializing Connections...");
    await mcpManager.initializeAll();

    // 3. Test Role Filtering via getToolInstructions
    console.log("3️⃣ Testing Role-Based Instructions...");

    const cmoInstructions = await mcpManager.getToolInstructions('CMO_TREND_ANALYZER');
    console.log("\n--- CMO Instructions Preview (Top 3 lines) ---");
    console.log(cmoInstructions.split('\n').slice(0, 5).join('\n'));

    const cdoInstructions = await mcpManager.getToolInstructions('CDO_DESIGNER');
    console.log("\n--- CDO Instructions Preview (Top 3 lines) ---");
    console.log(cdoInstructions.split('\n').slice(0, 5).join('\n'));

    // 4. Test Routing/Status
    console.log("\n4️⃣ Checking System Status...");
    try {
        const routingTest = await mcpManager.getStatus();
        console.table(routingTest);
    } catch (e) {
        console.error("Routing check failed:", e);
    }

    console.log("🏁 Verification Complete.");
    process.exit(0);
}

verifyAll();
