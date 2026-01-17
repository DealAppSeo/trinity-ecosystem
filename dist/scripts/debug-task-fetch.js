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
const supabase_js_1 = require("@supabase/supabase-js");
const path_1 = __importDefault(require("path"));
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
// Inject if still missing (Fallback)
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';
    process.env.SUPABASE_SERVICE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function diagnose() {
    console.log("🕵️ Checking Test Tasks Status...");
    // Check the tasks we created previously
    const targetIds = [140970, 140972, 140974];
    // MONITOR ONLY
    const { data: tasks } = await supabase
        .from('trinity_tasks')
        .select('*')
        .in('id', targetIds);
    tasks === null || tasks === void 0 ? void 0 : tasks.forEach(t => {
        var _a;
        console.log(`Task ${t.id}: [${t.status}] Assigned: ${t.assigned_to}`);
        if (t.status === 'completed') {
            console.log(`   ✅ Result: ${(_a = t.result) === null || _a === void 0 ? void 0 : _a.substring(0, 50)}...`);
        }
    });
    console.log("\n📦 Checking Recent Artifacts (Last 5)...");
    const { data: artifacts } = await supabase
        .from('trinity_artifacts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
    if (artifacts && artifacts.length > 0) {
        artifacts.forEach(a => {
            console.log(`   📄 [${a.artifact_type}] ${a.title || 'Untitled'} (${a.file_path || 'No Path'})`);
        });
    }
    else {
        console.log("   ❌ No recent artifacts found.");
    }
    console.log("\n📜 Checking Recent Agent Logs (Errors only)...");
    const { data: logs } = await supabase
        .from('trinity_agent_logs')
        .select('*')
        .eq('level', 'error')
        .order('created_at', { ascending: false })
        .limit(5);
    if (logs && logs.length > 0) {
        logs.forEach(l => console.log(`   🔴 [${l.agent_name}] ${l.message}`));
    }
    else {
        console.log("   ✅ No recent error logs.");
    }
}
diagnose();
