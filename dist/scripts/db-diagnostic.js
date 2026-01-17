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
async function diagnose() {
    console.log('--- [TRINITY DB DIAGNOSTIC] ---');
    const { count: taskCount, error: taskError } = await supabase.from('trinity_tasks').select('*', { count: 'exact', head: true });
    console.log(`Total Tasks: ${taskCount}`);
    const { count: artCount, error: artError } = await supabase.from('trinity_artifacts').select('*', { count: 'exact', head: true });
    console.log(`Total Artifacts: ${artCount}`);
    const { data: latest, error: lateError } = await supabase.from('trinity_tasks').select('id, title, status, created_at').order('created_at', { ascending: false }).limit(5);
    console.log('Latest 5 Tasks:', latest);
    if (taskCount && taskCount > 5000) {
        console.warn('⚠️ WARNING: Massive task table. May cause timeouts.');
    }
}
diagnose();
