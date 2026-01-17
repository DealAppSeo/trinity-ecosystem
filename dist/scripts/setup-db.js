"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sqlFile = process.argv[2];
if (!supabaseUrl || !supabaseKey || !sqlFile) {
    console.error('Usage: npx ts-node scripts/setup-db.ts <sql-file-path>');
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
async function runSql() {
    const filePath = path_1.default.resolve(process.cwd(), sqlFile);
    if (!fs_1.default.existsSync(filePath)) {
        console.error('File not found:', filePath);
        return;
    }
    const sqlContent = fs_1.default.readFileSync(filePath, 'utf-8');
    // NOTE: Supabase JS client doesn't support raw SQL execution directly on public API.
    // However, if we are internal, we assume the user has run this.
    // Wait, since we can't run RAW SQL via client easily without an RPC function, 
    // we will simulate it by just printing instructions IF it fails, OR assuming the RPC 'exec_sql' exists.
    // Attempting a common pattern:
    console.warn('⚠️ NOTE: Supabase JS cannot run raw SQL migration directly unless "exec_sql" RPC exists.');
    console.warn('Please run the following SQL manually in Supabase Dashboard SQL Editor:');
    console.log('\n' + sqlContent + '\n');
    console.log('-----------------------------------');
}
runSql();
