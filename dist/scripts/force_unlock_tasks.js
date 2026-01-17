"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load ENV
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env.local') });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase Credentials');
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey);
async function unlockTasks() {
    console.log('🔓 Unlocking Stalled Tasks (Aggressive Open Market Mode)...');
    // 1. Reset ALL tasks that are not done to 'pending' and clear assignments
    // This removes any "Persona" assignments (Nexus, Constructor) and lets active agents bid.
    const { error: resetError } = await supabase
        .from('trinity_tasks')
        .update({
        assigned_to: null,
        status: 'pending'
    })
        .in('status', ['todo', 'pending', 'in_progress', 'running'])
        // Safety: Don't reset completed or failed tasks
        .not('status', 'in', ['completed', 'done', 'failed', 'success']);
    if (resetError) {
        console.error('❌ Error unlocking tasks:', resetError.message);
    }
    else {
        console.log('✅ Successfully reset ALL active tasks to PENDING state.');
        console.log('   - Cleared "assigned_to" (Removed Persona locks)');
        console.log('   - Set status to "pending" (Ready for Auction)');
    }
    // 2. Verify Count
    const { count } = await supabase
        .from('trinity_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
    console.log(`\n📊 Total Pending Tasks available for Bidding: ${count}`);
}
unlockTasks();
