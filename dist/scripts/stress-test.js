"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = (0, supabase_js_1.createClient)(url, key);
async function runStressTest() {
    var _a;
    console.log('--- [TRINITY PRODUCTION STRESS TEST] ---');
    console.log('Objective: Verify cross-agent artifact chain.');
    // 1. Create a chain of 3 tasks
    const testId = `stress-${Date.now().toString().slice(-4)}`;
    const tasks = [
        {
            title: `[STRESS] Phase A: Market Research (${testId})`,
            description: "Research 3 tokenized real estate competitors. Focus on TVL and market cap.",
            task_type: 'research',
            assigned_to: 'trinity-sophia',
            status: 'pending',
            priority: 100,
            is_real: true
        },
        {
            title: `[STRESS] Phase B: Design Wireframe (${testId})`,
            description: "Based on the research from Phase A, suggest a UI layout for a competitive dashboard.",
            task_type: 'design',
            assigned_to: 'trinity-mel',
            status: 'pending',
            priority: 99,
            is_real: true
        },
        {
            title: `[STRESS] Phase C: Tech Review (${testId})`,
            description: "Review the suggested design and research. Draft a implementation plan for a Next.js component.",
            task_type: 'code',
            assigned_to: 'trinity-nexus',
            status: 'pending',
            priority: 98,
            is_real: true
        }
    ];
    console.log(`Injecting ${tasks.length} tasks into the swarm (Serialized)...`);
    for (const task of tasks) {
        const { data, error } = await supabase.from('trinity_tasks').insert(task).select();
        if (error) {
            console.error(`❌ Failed to inject task "${task.title}":`, error.message);
        }
        else {
            console.log(`✅ Injected: ${task.title} (ID: ${(_a = data === null || data === void 0 ? void 0 : data[0]) === null || _a === void 0 ? void 0 : _a.id})`);
        }
    }
    console.log('--- [MONITORING MODE] ---');
    console.log(`Watch the dashboard or run 'npx tsx scripts/check-task-updates.ts' to track progress.`);
}
runStressTest();
