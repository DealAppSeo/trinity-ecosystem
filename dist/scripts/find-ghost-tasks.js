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
async function findGhostTasks() {
    console.log('--- [TRINITY GHOST TASK SEARCH] ---');
    // Check for null status
    const { count: nullCount } = await supabase.from('trinity_tasks').select('*', { count: 'exact', head: true }).is('status', null);
    console.log(`Status IS NULL: ${nullCount}`);
    // Check for other statuses
    const { data: samples } = await supabase.from('trinity_tasks').select('status').limit(100);
    const uniqueStatuses = [...new Set(samples === null || samples === void 0 ? void 0 : samples.map(s => s.status))];
    console.log('Unique statuses found in sample:', uniqueStatuses);
    // Get exact count of everything
    const { count: totalCount } = await supabase.from('trinity_tasks').select('*', { count: 'exact', head: true });
    console.log(`Total absolute count: ${totalCount}`);
}
findGhostTasks();
