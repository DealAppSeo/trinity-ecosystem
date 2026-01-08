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
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
// Load Env
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Missing Credentials");
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_KEY);
const topology = [
    // ORCHESTRATION LAYER (The 3 Managers)
    { agent_id: 'MANAGER_ROUTER', role: 'ORCHESTRATOR', status: 'ACTIVE', current_task: 'Monitoring Signal Traffic' },
    { agent_id: 'MANAGER_HITL', role: 'ORCHESTRATOR', status: 'IDLE', current_task: 'Waiting for Escalation' },
    { agent_id: 'MANAGER_REPUTATION', role: 'ORCHESTRATOR', status: 'ACTIVE', current_task: 'Verifying ZKP Proofs' },
    // GROK POD (Market / Viral)
    { agent_id: 'GROK_CMO_TREND', role: 'CMO', status: 'ACTIVE', current_task: 'Scanning X API' },
    { agent_id: 'GROK_CMO_CONTENT', role: 'CMO', status: 'IDLE', current_task: null },
    { agent_id: 'GROK_CMO_CAMPAIGN', role: 'CMO', status: 'IDLE', current_task: null },
    // CLAUDE POD (UI / UX / Code)
    { agent_id: 'CLAUDE_CDO_DESIGN', role: 'CDO', status: 'ACTIVE', current_task: 'Refining Glassmorphism' },
    { agent_id: 'CLAUDE_CDO_FLOW', role: 'CDO', status: 'IDLE', current_task: null },
    { agent_id: 'CLAUDE_CDO_PROTO', role: 'CDO', status: 'IDLE', current_task: null },
    // GEMINI POD (Security / Infra)
    { agent_id: 'GEMINI_CTO_PROOF', role: 'CTO', status: 'ACTIVE', current_task: 'Generating Plonky3 Proofs' },
    { agent_id: 'GEMINI_CTO_SCHEMA', role: 'CTO', status: 'IDLE', current_task: null },
    { agent_id: 'GEMINI_CTO_AUDIT', role: 'CTO', status: 'IDLE', current_task: null },
];
async function seed() {
    console.log("🌱 Seeding 3x3 + 3 Topology into Sandbox DB...");
    // Clear existing to avoid duplicates in this simple script 
    // (In prod we would upsert, but pure insert is cleaner for a reset)
    // Actually, delete is risky if orchestrator is running. Let's Loop and Upsert.
    for (const agent of topology) {
        const payload = {
            agent_id: agent.agent_id,
            status: agent.status,
            current_task: agent.current_task,
            memory: { role: agent.role, seed: true },
            updated_at: new Date().toISOString()
        };
        const { error } = await supabase
            .from('sandbox_agent_state')
            .insert([payload]) // Insert new log entries to "Update" their status
            .select();
        if (error)
            console.error(`❌ Failed to seed ${agent.agent_id}:`, error.message);
        else
            console.log(`✅ Seeded ${agent.agent_id}`);
    }
    console.log("🏁 Toplogy Seeding Complete.");
}
seed();
