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
const supabase_js_1 = require("@supabase/supabase-js");
// ============================================
// SYSTEM AUDIT SPAWNER
// ============================================
// Creates "System Audit" tasks for agents to review performance.
// Specifically targets: Trinity-Veritas (Truth) and Trinity-Mel (Care).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
async function spawnAuditTasks() {
    console.log("🕵️ Starting System Audit Spawn...");
    // 1. Check Bid Volume
    const { count: bidCount } = await supabase
        .from('trinity_bids')
        .select('*', { count: 'exact', head: true });
    // 2. Check Mock Call Volume (Errors)
    // Using runtime_errors table if mock table not high volume yet
    const { count: errorCount } = await supabase
        .from('trinity_runtime_errors')
        .select('*', { count: 'exact', head: true });
    console.log(`📊 Stats: ${bidCount} Bids, ${errorCount} Errors.`);
    // 3. Spawn Veritas Audit (Truth/Performance)
    // Only if not already pending
    const { data: existingVeritas } = await supabase
        .from('trinity_tasks')
        .select('*')
        .eq('status', 'pending')
        .eq('assigned_to', 'trinity-veritas')
        .ilike('title', '%Audit Bidding%');
    if (!existingVeritas || existingVeritas.length === 0) {
        await supabase.from('trinity_tasks').insert({
            title: `[AUDIT] Review Bidding Performance (N=${bidCount})`,
            description: `[SYSTEM_AUDIT]\n1. READ 'trinity_bids' table.\n2. ANALYZE winner distribution.\n3. REPORT anomalies or inefficiencies in a markdown file.\n4. SUGGEST improvements to 'lib/anfis-bid-resolver.ts'.`,
            task_type: 'system_audit',
            assigned_to: 'trinity-veritas',
            priority: 85,
            status: 'pending' // Auction will verify assignments but Veritas is preferred
        });
        console.log("✅ Created 'Audit Bidding' task for Veritas.");
    }
    // 4. Spawn Mel Audit (Care/Healing)
    const { data: existingMel } = await supabase
        .from('trinity_tasks')
        .select('*')
        .eq('status', 'pending')
        .eq('assigned_to', 'trinity-mel')
        .ilike('title', '%Heal Runtime%');
    if (errorCount && errorCount > 0 && (!existingMel || existingMel.length === 0)) {
        await supabase.from('trinity_tasks').insert({
            title: `[HEAL] Analyze Runtime Errors (N=${errorCount})`,
            description: `[SYSTEM_AUDIT]\n1. READ 'trinity_runtime_errors'.\n2. IDENTIFY recurring patterns.\n3. PROPOSE code fixes for the root causes.\n4. WRITE patch suggestions to 'healer_report.md'.`,
            task_type: 'system_audit',
            assigned_to: 'trinity-mel',
            priority: 90,
            status: 'pending'
        });
        console.log("✅ Created 'Heal Errors' task for Mel.");
    }
}
spawnAuditTasks().catch(console.error);
