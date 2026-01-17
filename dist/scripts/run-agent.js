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
const path_1 = __importDefault(require("path"));
// 1. LOAD ENVIRONMENT IMMEDIATELY
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
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
const http_1 = __importDefault(require("http"));
const agentName = process.argv[2];
if (!agentName) {
    console.error("❌ Usage: npx tsx scripts/run-agent.ts <AGENT_NAME>");
    process.exit(1);
}
// Name Normalization (Map Short -> Full)
const AGENT_MAP = {
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
    const { ConstitutionalAgent } = await Promise.resolve().then(() => __importStar(require('../lib/agent/ConstitutionalAgent')));
    console.log(`🤖 Starting Agent: ${finalAgentName}...`);
    const agent = new ConstitutionalAgent({ name: finalAgentName });
    await agent.syncState();
    console.log(`✅ ${finalAgentName} is ONLINE (Tier: ${agent.autonomyTier}, Rep: ${agent.reputationScore})`);
    // START HTTP SERVER FOR RAILWAY/UPTIME ROBOT
    // Railway requires the app to listen on PORT (usually 3000)
    const port = process.env.PORT || 3000;
    // Start Heal Server (Dynamic Port)
    const PORT = 3000 + Math.floor(Math.random() * 1000);
    const server = http_1.default.createServer((req, res) => {
        if (req.url === '/health') {
            res.writeHead(200);
            res.end('OK');
        }
        else {
            res.writeHead(404);
            res.end();
        }
    });
    server.listen(PORT, () => {
        console.log(`[${finalAgentName}] 🌍 Health Server listening on port ${PORT}`);
    });
    // START MAIN AGENT LOOP
    console.log(`[${finalAgentName}] 🚀 Starting Trinity Healing Loop...`);
    await agent.startTrinityHealingLoop();
}
startAgent().catch(err => {
    console.error(`💥 FATAL: Agent ${finalAgentName} crashed:`, err);
    process.exit(1);
});
