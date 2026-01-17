"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials.');
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
const EVERGREEN_TASKS = [
    {
        title: "Artifact Generator: Cycle A",
        description: "Scan pending missions and create 1 document or report artifact. You MUST use the saveArtifact tool to write to the DB. Output format: Markdown.",
        status: "pending",
        priority: 9, // Critical
        task_type: "EVERGREEN"
    },
    {
        title: "Code Optimizer: Core Logic",
        description: "Review internal logs and produce an optimized code artifact (e.g. 'ConstitutionalAgent_Optimized.ts'). Post to DB using saveArtifact.",
        status: "pending",
        priority: 8, // High
        task_type: "EVERGREEN"
    },
    {
        title: "Design Auditor: Swarm Structure",
        description: "Generate a design artifact (Mermaid diagram or text description) auditing the current swarm structure. Store in DB via saveArtifact.",
        status: "pending",
        priority: 8, // High
        task_type: "EVERGREEN"
    },
    {
        title: "Web3 Integrator: HyperDAG Log",
        description: "Create a report on HyperDAG interactions. Hash the content and post to DB as an artifact.",
        status: "pending",
        priority: 5, // Medium
        task_type: "EVERGREEN"
    },
    {
        title: "Permission Auditor: Governance Report",
        description: "Review current DB permissions (mock) and generate a 'Governance Report' artifact. Save to DB.",
        status: "pending",
        priority: 5, // Medium
        task_type: "EVERGREEN"
    }
];
async function seedEvergreen() {
    console.log('🌱 Seeding Evergreen Artifact Tasks...');
    for (const task of EVERGREEN_TASKS) {
        // Check if exists to avoid dupe spam
        const { data: existing } = await supabase
            .from('trinity_tasks')
            .select('id')
            .eq('title', task.title)
            .eq('status', 'pending')
            .single();
        if (!existing) {
            const { error } = await supabase.from('trinity_tasks').insert(task);
            if (error)
                console.error(`❌ Failed to seed ${task.title}:`, error.message);
            else
                console.log(`✅ Seeded: ${task.title}`);
        }
        else {
            console.log(`⏭️  Skipping existing: ${task.title}`);
        }
    }
}
seedEvergreen();
