"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '.env.local' });
const MCPManager_1 = require("../lib/mcp/MCPManager");
const AlphaVantageMCP_1 = require("../lib/mcp/servers/AlphaVantageMCP");
const FigmaMCP_1 = require("../lib/mcp/servers/FigmaMCP");
const GitHubMCP_1 = require("../lib/mcp/servers/GitHubMCP");
const GoogleWorkspaceMCP_1 = require("../lib/mcp/servers/GoogleWorkspaceMCP");
const PlaywrightMCP_1 = require("../lib/mcp/servers/PlaywrightMCP");
async function verifyAll() {
    console.log("🚀 Starting MCP Manager Verification (Full Suite)...");
    // 1. Register Servers
    console.log("1️⃣ Registering Servers...");
    MCPManager_1.mcpManager.registerServer(new AlphaVantageMCP_1.AlphaVantageMCP());
    MCPManager_1.mcpManager.registerServer(new FigmaMCP_1.FigmaMCP());
    MCPManager_1.mcpManager.registerServer(new GitHubMCP_1.GitHubMCP());
    MCPManager_1.mcpManager.registerServer(new GoogleWorkspaceMCP_1.GoogleWorkspaceMCP());
    MCPManager_1.mcpManager.registerServer(new PlaywrightMCP_1.PlaywrightMCP());
    // 2. Initialize
    console.log("2️⃣ Initializing Connections...");
    await MCPManager_1.mcpManager.initializeAll();
    // 3. Test Role Filtering via getToolInstructions
    console.log("3️⃣ Testing Role-Based Instructions...");
    const cmoInstructions = await MCPManager_1.mcpManager.getToolInstructions('CMO_TREND_ANALYZER');
    console.log("\n--- CMO Instructions Preview (Top 3 lines) ---");
    console.log(cmoInstructions.split('\n').slice(0, 5).join('\n'));
    const cdoInstructions = await MCPManager_1.mcpManager.getToolInstructions('CDO_DESIGNER');
    console.log("\n--- CDO Instructions Preview (Top 3 lines) ---");
    console.log(cdoInstructions.split('\n').slice(0, 5).join('\n'));
    // 4. Test Routing/Status
    console.log("\n4️⃣ Checking System Status...");
    try {
        const routingTest = await MCPManager_1.mcpManager.getStatus();
        console.table(routingTest);
    }
    catch (e) {
        console.error("Routing check failed:", e);
    }
    console.log("🏁 Verification Complete.");
    process.exit(0);
}
verifyAll();
