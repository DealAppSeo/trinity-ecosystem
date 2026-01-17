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
require("dotenv/config");
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
const supabase_js_1 = require("@supabase/supabase-js");
const ConstitutionalAgent_1 = require("../lib/agent/ConstitutionalAgent");
// 1. FORCE LOAD ENV
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
async function runDemo() {
    console.log('--- [TRINITY 🚀 LIVE PRODUCTION DEMO] ---');
    console.log('Objective: Prove production code can execute, complete, and save artifacts.');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = (0, supabase_js_1.createClient)(url, key);
    // 1. Inject a dedicated High-Priority Demo Task
    const demoId = `DEMO-${Date.now().toString().slice(-4)}`;
    console.log(`[DEMO] 🔨 Injecting Dedicated Task: ${demoId}`);
    const { data: task, error: injectError } = await supabase.from('trinity_tasks').insert({
        title: `[PROD-DEMO] Artifact Proof of Life (${demoId})`,
        description: "Analyze the current ecosystem stability and produce a 1-paragraph sustainability report.",
        task_type: 'research',
        assigned_to: 'trinity-shofet',
        status: 'pending',
        priority: 1000,
        is_real: true
    }).select().single();
    if (injectError) {
        console.error('❌ Failed to inject demo task:', injectError.message);
        return;
    }
    console.log(`[DEMO] ✅ Task Injected: ${task.id} (BigInt)`);
    // 2. Instantiate and Run Agent for ONE task only
    console.log(`[DEMO] 🤖 Booting trinity-shofet (PROD MODE)...`);
    const agent = new ConstitutionalAgent_1.ConstitutionalAgent({ name: 'trinity-shofet' });
    console.log(`[DEMO] 🏃 Manually claiming and processing task: ${task.id}`);
    try {
        await agent.syncState();
        const { error: claimError } = await supabase
            .from('trinity_tasks')
            .update({ status: 'in_progress', claimed_by: agent.name, started_at: new Date().toISOString() })
            .eq('id', task.id);
        if (claimError)
            throw new Error(`Claim failed: ${claimError.message}`);
        await new Promise(r => setTimeout(r, 1000));
        // Process directly
        await agent.processTask(task);
        console.log(`[DEMO] 🎉 Task ${task.id} PROCESSING COMPLETE.`);
        // 3. Verification
        console.log(`[DEMO] 🔍 Verifying Artifact Creation...`);
        // Wait a beat for DB sync
        await new Promise(r => setTimeout(r, 2000));
        const { data: artifact, error: artError } = await supabase
            .from('trinity_artifacts')
            .select('*')
            .eq('task_id', String(task.id))
            .limit(1);
        if (artError || !artifact || artifact.length === 0) {
            console.error(`❌ NO ARTIFACT PRODUCED in Holy Grail Schema.`);
            // Check legacy
            const { data: v4Art } = await supabase.from('trinity_artifacts').select('*').eq('task_id', String(task.id)).limit(1);
            if (v4Art && v4Art.length > 0) {
                console.log(`✅ Artifact FOUND in Legacy Schema (V4):`, v4Art[0].id);
            }
        }
        else {
            console.log(`✅ SUCCESS! Artifact FOUND in Holy Grail Schema (V5): ${artifact[0].id}`);
            console.log(`🔗 URL: ${artifact[0].url || artifact[0].file_path}`);
        }
    }
    catch (e) {
        console.error(`💥 DEMO CRASHED: ${e.message}`);
    }
    console.log('--- [DEMO FINISHED] ---');
}
runDemo();
