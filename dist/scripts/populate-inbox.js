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
// Setup Supabase with Anon Key (verified working)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
const TEST_SCENARIOS = [
    {
        name: 'trinity-torch',
        suggestion: "Optimize research latency by batching search queries. Prioritize depth over speed.",
        confidence: 0.89
    },
    {
        name: 'trinity-nexus',
        suggestion: "Increase resource allocation for Context Window. User engagement is high.",
        confidence: 0.95
    },
    {
        name: 'trinity-mel',
        suggestion: "Refactor code output to favor TypeScript interfaces over Types. Strict mode recommended.",
        confidence: 0.76
    },
    {
        name: 'trinity-sophi', // Intentional typo test or new agent
        suggestion: "Analyze emotional sentiment in user logs. Detect frustration markers.",
        confidence: 0.92
    }
];
async function populateInbox() {
    console.log("🚀 Populating ANFIS Inbox for UX Testing...");
    for (const scenario of TEST_SCENARIOS) {
        console.log(`🤖 Processing ${scenario.name}...`);
        // 1. Ensure Agent Exists
        await supabase.from('trinity_agent_registry').upsert({
            agent_name: scenario.name,
            status: 'working',
            current_tier: 'Grow',
            reputation_score: Math.floor(Math.random() * 40) + 60, // 60-100
            tasks_completed: Math.floor(Math.random() * 100),
            tasks_failed: 0
        }, { onConflict: 'agent_name' });
        // 2. Inject Suggestion
        const { error } = await supabase
            .from('trinity_agent_registry')
            .update({
            suggested_prompt: scenario.suggestion,
            suggestion_confidence: scenario.confidence,
            suggestion_accepted: false, // Reset
            directive_source: 'fallback' // Reset
        })
            .eq('agent_name', scenario.name);
        if (error) {
            console.error(`❌ Failed to inject for ${scenario.name}:`, error.message);
        }
        else {
            console.log(`✅ Suggestion injected for ${scenario.name}`);
        }
    }
    console.log("\n✨ Inbox Populated! Go to http://localhost:3000/pulse/wisdom");
}
populateInbox().catch(console.error);
