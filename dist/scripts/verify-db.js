"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const url_1 = require("url");
const path_1 = __importDefault(require("path"));
const __filename = (0, url_1.fileURLToPath)(import.meta.url);
const __dirname = path_1.default.dirname(__filename);
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env.local') });
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function checkTables() {
    console.log('🔍 Checking Supabase Tables...');
    const tables = ['trinity_retros', 'trinity_research_log'];
    for (const table of tables) {
        const { error } = await supabase.from(table).select('count', { count: 'exact', head: true });
        if (error && error.code === '42P01') {
            console.error(`❌ Table '${table}' DOES NOT EXIST.`);
        }
        else if (error) {
            console.error(`⚠️ Error checking '${table}':`, error.message);
        }
        else {
            console.log(`✅ Table '${table}' exists and is actionable.`);
        }
    }
}
checkTables();
