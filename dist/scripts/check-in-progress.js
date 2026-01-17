"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = (0, supabase_js_1.createClient)(url, key);
async function check() {
    const { data: tasks, error } = await supabase
        .from('trinity_tasks')
        .select('*')
        .eq('status', 'in_progress');
    if (error) {
        console.error('Error fetching tasks:', error.message);
    }
    else {
        console.log(`--- IN PROGRESS TASKS (${(tasks === null || tasks === void 0 ? void 0 : tasks.length) || 0}) ---`);
        tasks === null || tasks === void 0 ? void 0 : tasks.forEach(t => {
            console.log(`[${t.claimed_by}] ${t.title}`);
        });
    }
}
check();
