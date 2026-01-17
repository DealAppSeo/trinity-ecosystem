"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env.local') });
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function checkMissions() {
    console.log('🕵️ Checking Seeded Missions...');
    const titles = [
        '[MISSION: ALPHA] Global AI Trend Analysis 2026',
        '[MISSION: BETA] User Safety Protocol Audit',
        '[MISSION: GAMMA] Generate React Component: DataGrid'
    ];
    const { data: tasks, error } = await supabase
        .from('trinity_tasks')
        .select('id, title, status, assigned_to, result, created_at')
        .in('title', titles);
    if (error) {
        console.error('❌ Error fetching missions:', error.message);
        return;
    }
    if (tasks && tasks.length > 0) {
        tasks.forEach(t => {
            console.log(`\n📌 [${t.status.toUpperCase()}] ${t.title}`);
            console.log(`   - Assigned: ${t.assigned_to || 'UNASSIGNED'}`);
            console.log(`   - ID: ${t.id}`);
            if (t.result)
                console.log(`   - Result Preview: ${t.result.substring(0, 50)}...`);
        });
    }
    else {
        console.log('⚠️ No seeded missions found. (Did seed script run?)');
    }
}
checkMissions();
