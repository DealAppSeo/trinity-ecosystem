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
async function checkActiveAgents() {
    console.log('🕵️ Checking Active Agents in Registry...');
    // Get agents active in last 5 minutes
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data, error } = await supabase
        .from('trinity_agent_registry')
        .select('agent_name, last_active, current_tier, reputation_score')
        .gte('last_active', fiveMinsAgo);
    if (error) {
        console.error('❌ Error fetching registry:', error.message);
        return;
    }
    if (data && data.length > 0) {
        console.log(`✅ ${data.length} Agents Active recently:`);
        data.forEach(a => console.log(`   - ${a.agent_name} (Tier: ${a.current_tier}, Rep: ${a.reputation_score})`));
    }
    else {
        console.log('⚠️ No agents found active in last 5 minutes.');
    }
}
checkActiveAgents();
