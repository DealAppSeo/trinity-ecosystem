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
// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log("Debug: CWD =", process.cwd());
console.log("Debug: .env path =", path.resolve(__dirname, '../.env'));
console.log("Debug: Env Keys Loaded =", Object.keys(process.env).filter(k => k.includes('SUPABASE')));
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Missing Supabase URL or Service Key. Check .env file.");
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_KEY);
async function healZombieTasks() {
    console.log("🏥 Starting Trinity System Healing...");
    console.log(`🔌 Connecting to ${SUPABASE_URL}`);
    // 1. Count Zombies
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
        .from('trinity_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_progress')
        .lt('updated_at', oneHourAgo);
    if (countError) {
        console.error("❌ Failed to count zombies:", countError.message);
        return;
    }
    console.log(`🧟 Found ${count} zombie tasks (in_progress > 1 hour).`);
    if (count === 0) {
        console.log("✨ System is clean. No healing needed.");
        return;
    }
    // 2. Reset them
    console.log("💉 Injecting synthesis serum (Resetting to 'pending')...");
    const { data, error: updateError } = await supabase
        .from('trinity_tasks')
        .update({
        status: 'pending',
        claimed_by: null,
        started_at: null,
        metadata: {
            reset_reason: 'stale_in_progress_detected_by_cleanup',
            healed_at: new Date().toISOString()
        }
    })
        .eq('status', 'in_progress')
        .lt('updated_at', oneHourAgo)
        .select();
    if (updateError) {
        console.error("❌ Failed to heal tasks:", updateError.message);
    }
    else {
        console.log(`✅ Successfully healed ${data.length} tasks.`);
        console.log("🔄 Agents can now reclaim these tasks.");
    }
}
healZombieTasks().catch(console.error);
