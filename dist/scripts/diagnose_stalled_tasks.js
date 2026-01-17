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
async function diagnose() {
    console.log('🔍 Running System Diagnosis...\n');
    // 1. Task Status Counts
    const { data: tasks, error: taskError } = await supabase
        .from('trinity_tasks')
        .select('id, status, title, created_at, priority');
    if (taskError) {
        console.error('❌ Error fetching tasks:', taskError.message);
    }
    else {
        const counts = tasks === null || tasks === void 0 ? void 0 : tasks.reduce((acc, t) => {
            acc[t.status] = (acc[t.status] || 0) + 1;
            return acc;
        }, {});
        console.log('📊 Task Status Summary:', counts);
        const pending = (tasks === null || tasks === void 0 ? void 0 : tasks.filter(t => t.status === 'pending')) || [];
        if (pending.length > 0) {
            console.log(`\n⚠️  ${pending.length} Pending Tasks (Oldest: ${pending[0].created_at})`);
            pending.slice(0, 3).forEach(t => console.log(`   - [${t.priority}] ${t.title}`));
        }
    }
    // 2. Bid Coverage
    const { data: bids, error: bidError } = await supabase
        .from('trinity_bids')
        .select('*');
    if (bidError) {
        console.error('❌ Error fetching bids:', bidError.message);
    }
    else {
        const uniqueTasksBidded = new Set(bids === null || bids === void 0 ? void 0 : bids.map(b => b.task_id)).size;
        console.log(`\n💰 Total Bids: ${bids === null || bids === void 0 ? void 0 : bids.length} (Covering ${uniqueTasksBidded} unique tasks)`);
    }
    // 3. Agent Logs (Recent activity)
    const { data: logs, error: logError } = await supabase
        .from('trinity_agent_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
    if (logError) {
        console.error('❌ Error fetching logs:', logError.message);
    }
    else {
        console.log('\n📜 Recent System Logs (Is the scheduler running?):');
        logs === null || logs === void 0 ? void 0 : logs.forEach(l => {
            console.log(`   [${new Date(l.created_at).toLocaleTimeString()}] [${l.agent_name}] ${l.message.substring(0, 80)}...`);
        });
    }
    // 4. Runtime Healer
    const { count, error: countError } = await supabase
        .from('trinity_runtime_errors')
        .select('*', { count: 'exact', head: true });
    if (!countError) {
        console.log(`\n🚑 Total Runtime Errors Logged: ${count}`);
    }
    console.log('\n✅ Diagnosis Complete.');
}
diagnose();
