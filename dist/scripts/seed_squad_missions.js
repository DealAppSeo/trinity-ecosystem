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
const MISSIONS = [
    // ALPHA SQUAD (TRUTH) - Research & Analysis
    {
        title: '[MISSION: ALPHA] Global AI Trend Analysis 2026',
        description: 'Research the top 5 emerging trends in "Agentic AI" for Q1 2026. \n\nDirectives:\n1. Use Tavily to find recent papers/articles.\n2. Synthesize findings into a structured markdown report.\n3. Artifact MUST be named "2026_AI_Trends_Report.md".',
        task_type: 'research',
        priority: 90,
        assigned_to: 'trinity-gcm' // Force assign to test GCM
    },
    // BETA SQUAD (CARE) - UX & Safety
    {
        title: '[MISSION: BETA] User Safety Protocol Audit',
        description: 'Review the current "safety measures" for autonomous agents. \n\nDirectives:\n1. Create a safety checklist for agent deployment.\n2. Define "Kill Switch" protocols.\n3. Artifact MUST be named "Safety_Protocol_v1.md".',
        task_type: 'content',
        priority: 90,
        assigned_to: 'trinity-apm'
    },
    // GAMMA SQUAD (BUILD) - Coding & Implementation
    {
        title: '[MISSION: GAMMA] Generate React Component: DataGrid',
        description: 'Write a robust React Functional Component for a "DataGrid" using Tailwind CSS. \n\nDirectives:\n1. Include sorting and filtering capabilities.\n2. Implementation must be TypeScript.\n3. Artifact MUST be named "DataGrid.tsx".',
        task_type: 'code',
        priority: 90,
        assigned_to: 'trinity-hdm' // Test the "Build" agent
    }
];
async function seedMissions() {
    console.log('🌱 Seeding High-Quality Missions...');
    for (const m of MISSIONS) {
        const { error } = await supabase.from('trinity_tasks').insert({
            ...m,
            status: 'pending',
            created_at: new Date().toISOString()
        });
        if (error)
            console.error(`❌ Failed to seed ${m.title}:`, error.message);
        else
            console.log(`✅ Seeded: ${m.title} -> ${m.assigned_to}`);
    }
}
seedMissions();
