"use strict";
const { mcpManager } = require('../lib/mcp/MCPManager');
const { AlphaVantageMCP } = require('../lib/mcp/servers/AlphaVantageMCP');
const { FigmaMCP } = require('../lib/mcp/servers/FigmaMCP');
const { GitHubMCP } = require('../lib/mcp/servers/GitHubMCP');
const { GoogleWorkspaceMCP } = require('../lib/mcp/servers/GoogleWorkspaceMCP');
const { PlaywrightMCP } = require('../lib/mcp/servers/PlaywrightMCP');
async function showManuals() {
    // Register everything again (since this is a fresh process)
    mcpManager.registerServer(new AlphaVantageMCP());
    mcpManager.registerServer(new FigmaMCP());
    mcpManager.registerServer(new GitHubMCP());
    mcpManager.registerServer(new GoogleWorkspaceMCP());
    mcpManager.registerServer(new PlaywrightMCP());
    console.log("Initializing...");
    await mcpManager.initializeAll();
    console.log("==========================================");
    console.log("📘 GENERATED AGENT TRAINING MANUALS");
    console.log("==========================================\n");
    const roles = ['CMO_SQUAD', 'CDO_SQUAD', 'CTO_SQUAD'];
    for (const role of roles) {
        console.log(`\n------------------------------------------`);
        console.log(`👤 ROLE: ${role}`);
        console.log(`------------------------------------------`);
        const manual = await mcpManager.getToolInstructions(role);
        console.log(manual);
    }
}
showManuals();
