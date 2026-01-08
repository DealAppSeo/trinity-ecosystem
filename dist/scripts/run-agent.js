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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '.env.local' });
const ConstitutionalAgent_1 = require("../lib/agent/ConstitutionalAgent");
const http_1 = __importDefault(require("http")); // Added import for http and types
const agentName = process.argv[2];
if (!agentName) {
    console.error("❌ Usage: ts-node scripts/run-agent.ts <AGENT_NAME>");
    process.exit(1);
}
async function startAgent() {
    console.log(`🤖 Starting Agent: ${agentName}...`);
    const agent = new ConstitutionalAgent_1.ConstitutionalAgent({ name: agentName });
    await agent.syncState();
    console.log(`✅ ${agentName} is ONLINE (Tier: ${agent.autonomyTier}, Rep: ${agent.reputationScore})`);
    // START HTTP SERVER FOR RAILWAY/UPTIME ROBOT
    // Railway requires the app to listen on PORT (usually 3000)
    const port = process.env.PORT || 3000;
    const server = http_1.default.createServer((req, res) => {
        if (req.url === '/health' || req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'online',
                agent: agentName,
                uptime: process.uptime()
            }));
        }
        else {
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
