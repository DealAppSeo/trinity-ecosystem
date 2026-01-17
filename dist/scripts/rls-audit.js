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
async function inspect() {
    console.log('--- [TRINITY 🛡️ RLS & SCHEMA AUDIT] ---');
    // 1. Check for 'title' column existence
    const { data: cols, error: colError } = await supabase.rpc('get_table_columns', { table_name: 'trinity_artifacts' });
    if (colError) {
        console.log('RPC Failed. Trying raw query on information_schema...');
        const { data: rawCols, error: rawError } = await supabase
            .from('trinity_artifacts')
            .select('*')
            .limit(0);
        console.log('Available Columns (from empty select):', rawCols ? Object.keys(rawCols) : 'None');
    }
    else {
        console.log('Columns:', cols);
    }
    // 2. Test RLS with a dummy insert
    console.log('Testing RLS insert...');
    const { error: insError } = await supabase.from('trinity_artifacts').insert({
        task_id: 'test-rls-' + Date.now(),
        content_preview: 'test'
    });
    if (insError) {
        console.log(`❌ RLS TEST FAILED: ${insError.message}`);
    }
    else {
        console.log('✅ RLS TEST SUCCEEDED (Insert allowed)');
    }
}
inspect();
