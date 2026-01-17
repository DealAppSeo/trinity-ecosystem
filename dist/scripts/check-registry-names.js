"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Credentials');
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
async function checkRegistry() {
    console.log('🕵️ Checking Trinity Agent Registry...');
    const { data: registry, error: regError } = await supabase
        .from('trinity_agent_registry')
        .select('agent_name');
    if (regError) {
        console.error('❌ Registry Error:', regError.message);
    }
    else {
        console.log('📋 Registry Names:', registry === null || registry === void 0 ? void 0 : registry.map(r => r.agent_name));
    }
    const { data: heartbeats, error: hbError } = await supabase
        .from('trinity_heartbeat')
        .select('agent, last_seen');
    if (hbError) {
        console.error('❌ Heartbeat Error:', hbError.message);
    }
    else {
        console.log('❤️ Heartbeat Names:', heartbeats === null || heartbeats === void 0 ? void 0 : heartbeats.map(h => `${h.agent} (${h.last_seen})`));
    }
}
checkRegistry();
