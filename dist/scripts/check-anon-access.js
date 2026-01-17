"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Missing URL or Anon Key');
    process.exit(1);
}
// STRICTLY USE ANON KEY
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey);
async function checkAnonAccess() {
    console.log('🕵️ Checking Public Access (Anon Key) to trinity_heartbeat...');
    const { data, error } = await supabase
        .from('trinity_heartbeat')
        .select('*');
    if (error) {
        console.error('❌ ACCESS DENIED (RLS BLOCK):', error.message);
        console.error('   Hint: You need to enable RLS policy for SELECT on trinity_heartbeat for public/anon role.');
    }
    else {
        console.log(`✅ ACCESS GRANTED. Rows visible: ${(data === null || data === void 0 ? void 0 : data.length) || 0}`);
        if (data && data.length > 0) {
            console.log('   (The UI -should- be able to see these)');
        }
    }
}
checkAnonAccess();
