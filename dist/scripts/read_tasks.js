"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function readLatestTasks() {
    console.log('📋 Reading Latest Tasks...');
    const { data: tasks, error } = await supabase
        .from('trinity_tasks')
        .select('id, title, status, assigned_to, task_type')
        .order('created_at', { ascending: false })
        .limit(5);
    if (error) {
        console.error('❌ Failed:', error);
        return;
    }
    tasks.forEach(t => {
        console.log(`[${t.status.toUpperCase()}] ${t.title} (Type: ${t.task_type}) -> ${t.assigned_to || 'Unassigned'}`);
    });
}
readLatestTasks();
