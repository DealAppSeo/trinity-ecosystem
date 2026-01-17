"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load ENV
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env.local') });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey);
async function activateAgents() {
    console.log('⚡ Activating Swarm Agents (Repairing Registry Status)...');
    // 1. Fetch all agents
    const { data: agents } = await supabase.from('trinity_agent_registry').select('*');
    if (!agents || agents.length === 0) {
        console.log('❌ No agents found to activate.');
        return;
    }
    console.log(`Found ${agents.length} agents. Setting status to 'idle'...`);
    // 2. Update Status to 'idle'
    const { error } = await supabase
        .from('trinity_agent_registry')
        .update({ status: 'idle' })
        .neq('status', 'active'); // Don't interrupt active ones if any (though likely undefined)
    if (error) {
        console.error('❌ Error activating agents:', error.message);
    }
    else {
        console.log('✅ Success! All agents are now IDLE and ready to bid.');
        console.log('   (Gamma Squad should now appear on the dashboard)');
    }
}
activateAgents();
