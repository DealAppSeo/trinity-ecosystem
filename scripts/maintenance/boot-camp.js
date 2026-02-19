
const { mcpManager } = require('../lib/mcp/MCPManager');
const { AlphaVantageMCP } = require('../lib/mcp/servers/AlphaVantageMCP');
const { FigmaMCP } = require('../lib/mcp/servers/FigmaMCP');
const { GitHubMCP } = require('../lib/mcp/servers/GitHubMCP');
const { GoogleWorkspaceMCP } = require('../lib/mcp/servers/GoogleWorkspaceMCP');
const { PlaywrightMCP } = require('../lib/mcp/servers/PlaywrightMCP');

async function runBootCamp() {
    console.log("🥾 AGENT BOOT CAMP: LIVE FIRE EXERCISE");
    console.log("======================================");

    // 1. Initialize Infrastructure
    console.log("[SETUP] Wiring MCPs...");
    mcpManager.registerServer(new AlphaVantageMCP());
    mcpManager.registerServer(new FigmaMCP());
    mcpManager.registerServer(new GitHubMCP());
    mcpManager.registerServer(new GoogleWorkspaceMCP());
    mcpManager.registerServer(new PlaywrightMCP());
    await mcpManager.initializeAll();

    // 2. Simulate 'CTO' Agent Training
    const role = 'CTO_SQUAD';
    console.log(`\n[TRAINING] Onboarding Agent: ${role}`);
    const manual = await mcpManager.getToolInstructions(role);
    console.log(`[MANUAL] Agent received ${manual.length} chars of instructions.`);

    // 3. Live Fire Mission: GitHub Audit
    console.log(`\n[MISSION] Executing 'Verify Repo' task...`);

    // Simulate LLM deciding to call a tool
    const simulatedToolCall = {
        name: 'search_repositories',
        args: { query: 'trinity-ecosystem' }
    };

    console.log(`[AGENT] Decided to call: ${simulatedToolCall.name}`);
    try {
        const result = await mcpManager.callTool(simulatedToolCall.name, simulatedToolCall.args);
        console.log(`[SUCCESS] Tool Result:`, JSON.stringify(result).substring(0, 200) + "...");
    } catch (err) {
        console.error(`[FAILURE] Agent failed execution:`, err.message);
    }

    // 4. Live Fire Mission: Market Check (CMO)
    console.log(`\n[MISSION] Executing 'Market Check' task (CMO)...`);
    const cmoRole = 'CMO_SQUAD';
    const cmoManual = await mcpManager.getToolInstructions(cmoRole);
    console.log(`[MANUAL] CMO Agent received instructions.`);

    const marketToolCall = {
        name: 'get_stock_quote',
        args: { symbol: 'MSFT' }
    };
    console.log(`[AGENT] Decided to call: ${marketToolCall.name}`);
    try {
        const result = await mcpManager.callTool(marketToolCall.name, marketToolCall.args);
        console.log(`[SUCCESS] Market Data:`, JSON.stringify(result).substring(0, 200) + "...");
    } catch (err) {
        console.log(`[NOTE] Market data might fail if API key missing, but path works.`);
    }

    console.log("\n✅ BOOT CAMP COMPLETE. Agents are wired and dangerous.");
}

runBootCamp();
