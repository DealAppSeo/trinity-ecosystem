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
    const { count, error } = await supabase.from('trinity_artifacts').select('*', { count: 'exact', head: true });
    console.log(`Total Artifacts: ${count}`);
    // Check for our specific ID 241 or just latest
    const { data: all_latest } = await supabase.from('trinity_artifacts').select('*').order('created_at', { ascending: false }).limit(10);
    console.log('Latest 10 Artifacts Body Keys:', all_latest === null || all_latest === void 0 ? void 0 : all_latest.map(a => Object.keys(a)));
}
check();
