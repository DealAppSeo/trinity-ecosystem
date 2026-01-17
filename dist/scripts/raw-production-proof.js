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
// 1. FORCE LOAD ENV
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
async function runProof() {
    console.log('--- [TRINITY ⚡ RAW PRODUCTION PROOF] ---');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = (0, supabase_js_1.createClient)(url, key);
    // 1. Inject Task (Filling required fields)
    console.log('[PROOF] Injecting task...');
    const { data: task, error: tErr } = await supabase.from('trinity_tasks').insert({
        title: '[PROOF] Raw Production Test ' + Date.now(),
        description: 'Test description to satisfy not-null constraints.',
        status: 'pending',
        priority: 1000,
        task_type: 'research'
    }).select().single();
    if (tErr) {
        console.error('❌ Task Injection Failed:', tErr.message);
        return;
    }
    console.log(`[PROOF] ✅ Task injected: ${task.id}`);
    // 2. Attempt Artifact Save (Holy Grail Schema)
    console.log('[PROOF] Attempting Artifact Save...');
    const { error: aErr } = await supabase.from('trinity_artifacts').insert({
        task_id: task.id,
        title: `Proof Artifact ${task.id}`,
        content: 'Proof content.',
        artifact_type: 'text',
        creator_agent: 'trinity-shofet'
    });
    if (aErr) {
        console.warn(`❌ Artifact Save BLOCKED (Likely RLS): ${aErr.message}`);
    }
    else {
        console.log(`✅ SUCCESS! Artifact created.`);
    }
    // 3. Update Task
    console.log('[PROOF] Updating task...');
    const { error: updErr } = await supabase.from('trinity_tasks').update({
        status: 'completed',
        result: 'Success'
    }).eq('id', task.id);
    if (updErr) {
        console.error('❌ Task update failed:', updErr.message);
    }
    else {
        console.log('✅ Task marked COMPLETED.');
    }
}
runProof();
