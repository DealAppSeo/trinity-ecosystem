"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: '.env.local' });
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function seedSprint() {
    console.log('🚀 Spawning [SPRINT] NeuroSwarm Task...');
    const { error } = await supabase.from('trinity_tasks').insert({
        title: '[SPRINT] Generate 200+ NeuroSwarm Artifacts',
        description: `OBJECTIVE: Execute a high-velocity sprint to generate 200+ unique artifacts (Code, Design, Strategy) for the NeuroSwarm MVP.

STRATEGY:
1. DECOMPOSE: Break this task into 10 Sub-Tracks (e.g., "GNN Module", "Web3 Bidder", "Chaos Scenarios").
2. EXECUTE: Agents must use "Web-Aware Idle Mode" to find fresh ideas.
3. VERIFY: Every artifact must pass peer review.
4. LOOP: Use the Evergreen Life Cycle to auto-spawn next steps.

METRICS:
- Artifacts Created > 200
- Unique Agents Active > 3
- Uptime > 99%

[PRIORITY]: CRITICAL (99)`,
        task_type: 'strategy',
        assigned_to: 'trinity-sophia', // The Strategist
        priority: 99,
        status: 'pending',
        metadata: { tags: ['sprint', 'phase10', 'neuroswarm'], benchmark: true }
    });
    if (error)
        console.error('❌ Failed to seed sprint:', error.message);
    else
        console.log('✅ Sprint Task Seeded Successfully.');
}
seedSprint();
