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
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'trinity_artifacts' });
    // Fallback if rpc doesn't exist: use a sample insert or select
    const { data: sample, error: err2 } = await supabase.from('trinity_artifacts').select('*').limit(1);
    if (sample && sample.length > 0) {
        console.log('Columns in trinity_artifacts:', Object.keys(sample[0]));
    }
    else {
        console.log('Could not determine columns from sample.');
        if (err2)
            console.error('Sample Select Error:', err2.message);
    }
}
check();
