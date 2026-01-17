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
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '.env.local' });
const supabase_js_1 = require("@supabase/supabase-js");
// Setup Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
// Using Anon Key (ending in tPaQFw) as we verified it works for reading
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';
console.log('🔑 Script using Service Key length:', supabaseKey.length);
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
async function simulateSuggestion() {
    const AGENT_NAME = 'ANFIS_DEMO_BOT';
    console.log(`🤖 ANFIS Simulation: Analyzing Agent [${AGENT_NAME}]...`);
    // 1. Ensure Agent Exists
    const { error: upsertError } = await supabase.from('trinity_agent_registry').upsert({
        agent_name: AGENT_NAME,
        reputation_score: 88, // Good enough to deserve attention
        current_tier: 'Act',
        tasks_completed: 100,
        system_prompt: 'You are a simple demo bot. You track tasks.'
    }, { onConflict: 'agent_name' });
    if (upsertError) {
        console.error('❌ Failed to create/find agent:', upsertError.message);
        return;
    }
    // 2. Simulate "Brain" Analysis & Suggestion
    const suggestion = "You are a HIGHLY OPTIMIZED demo bot. You track tasks with 20% more efficiency and report directly to the Founder.";
    const confidence = 0.98;
    console.log(`💡 ANFIS generated new insight (Confidence: ${confidence})...`);
    console.log(`📝 Suggestion: "${suggestion}"`);
    // 3. Write to DB (The "Inbox" Event)
    const { error: updateError } = await supabase
        .from('trinity_agent_registry')
        .update({
        suggested_prompt: suggestion,
        suggestion_confidence: confidence,
        directive_source: 'anfis_suggested' // Mark it as coming from the brain
    })
        .eq('agent_name', AGENT_NAME);
    if (updateError) {
        console.error('❌ Failed to push suggestion to Inbox:', updateError.message);
    }
    else {
        console.log('\n✅ SUGGESTION SENT TO INBOX!');
        console.log('-----------------------------------');
        console.log('👀 GO TO: http://localhost:3000/pulse/wisdom');
        console.log('👉 Look for "ANFIS_DEMO_BOT" in the Pending Suggestions list.');
        console.log('👉 Click "Accept" to witness the Directive update live.');
    }
}
simulateSuggestion();
