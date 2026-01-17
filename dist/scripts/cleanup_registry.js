"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env.local') });
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const VALID_AGENTS = [
    // ALPHA
    'trinity-gcm', 'trinity-torch', 'trinity-veritas',
    // BETA
    'trinity-apm', 'trinity-chesed', 'trinity-mel',
    // GAMMA
    'trinity-hdm', 'trinity-nexus', 'trinity-sophia'
];
async function cleanupRegistry() {
    console.log('🧹 Cleaning up Agent Registry...');
    console.log(`ℹ️  Valid Agents: ${VALID_AGENTS.join(', ')}`);
    // 1. Delete from Registry
    const { error: regError, count: regCount } = await supabase
        .from('trinity_agent_registry')
        .delete({ count: 'exact' })
        .not('agent_name', 'in', `(${VALID_AGENTS.join(',')})`); // Syntax: not('col', 'in', '(a,b)')
    if (regError)
        console.error('❌ Registry Cleanup Failed:', regError.message);
    else
        console.log(`✅ Removed ${regCount !== null && regCount !== void 0 ? regCount : 'unknown'} invalid records from Agent Registry.`);
    // 2. Delete from Heartbeat (trinity_heartbeat)
    const { error: hbError, count: hbCount } = await supabase
        .from('trinity_heartbeat')
        .delete({ count: 'exact' })
        .not('agent', 'in', `(${VALID_AGENTS.join(',')})`);
    if (hbError)
        console.error('❌ Heartbeat Cleanup Failed:', hbError.message);
    else
        console.log(`✅ Removed ${hbCount !== null && hbCount !== void 0 ? hbCount : 'unknown'} invalid records from Heartbeat Table.`);
    // 3. Delete from Legacy Heartbeat (agent_heartbeat) if exists
    const { error: legError, count: legCount } = await supabase
        .from('agent_heartbeat')
        .delete({ count: 'exact' })
        .not('agent_name', 'in', `(${VALID_AGENTS.join(',')})`);
    if (legError) {
        // Table might not exist, ignore
    }
    else {
        console.log(`✅ Removed ${legCount !== null && legCount !== void 0 ? legCount : 'unknown'} invalid records from Legacy Heartbeat.`);
    }
}
cleanupRegistry();
