"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv = __importStar(require("dotenv"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Load environment variables
dotenv.config();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_KEY);
async function runMigration() {
    console.log('🚀 Starting Access DB Migration...');
    const sqlPath = path.join(__dirname, '../sql/trinity_access_invites.sql');
    if (!fs.existsSync(sqlPath)) {
        console.error('❌ SQL file not found at:', sqlPath);
        process.exit(1);
    }
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    // Split statements roughly by semicolon if needed, or try running as one block
    // Supabase JS client doesn't support generic SQL execution directly via client unless RPC is set up
    // BUT we can try using RPC if a generic exec function exists, OR just warn the user.
    // However, usually we might need to use the Postgres connection string with 'pg' package.
    // Check if 'exec_sql' rpc exists (common pattern in some setups)
    // If not, we might be stuck without direct SQL access from node script
    // unless we use 'pg' library and CONNECTION STRING.
    console.log('⚠️ NOTE: This script assumes you have an RPC function "exec_sql" or similar, OR you must run the SQL manually in Supabase Dashboard SQL Editor.');
    console.log('📄 SQL Content Preview:');
    console.log(sql.substring(0, 200) + '...');
    // Attempt RPC execution if available
    const { error } = await supabase.rpc('exec_sql', { sql });
    if (error) {
        console.log('⚠️ Automatic execution failed (RPC exec_sql missing?).');
        console.log('👉 ACTION REQUIRED: Copy contents of sql/trinity_access_invites.sql to Supabase SQL Editor.');
    }
    else {
        console.log('✅ Migration executed successfully via RPC!');
    }
}
runMigration().catch(console.error);
