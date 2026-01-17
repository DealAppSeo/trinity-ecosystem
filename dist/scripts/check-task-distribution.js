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
    console.log('--- [TRINITY TASK DISTRIBUTION] ---');
    const { data, error } = await supabase.rpc('get_task_status_distribution'); // This might not exist, trying fallback
    if (error) {
        // Fallback: Individual counts
        const statuses = ['pending', 'in_progress', 'completed', 'failed'];
        for (const s of statuses) {
            const { count } = await supabase.from('trinity_tasks').select('*', { count: 'exact', head: true }).eq('status', s);
            console.log(`${s}: ${count}`);
        }
    }
    else {
        console.log(data);
    }
}
check();
