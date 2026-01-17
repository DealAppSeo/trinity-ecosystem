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
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
// Load Environment
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing Supabase Credentials');
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_KEY);
const DIAGNOSIS_TASKS = [
    {
        title: '[DIAGNOSIS] Test 1: Full Document Cycle',
        description: `
        GOAL: Verify end-to-end artifact creation.
        INSTRUCTIONS:
        1. Research the phrase "Antifragile AI".
        2. Create a markdown document titled "Antifragile_Report_Test.md".
        3. The document must contain 3 sections: Definition, Benefits, and Implementation.
        4. You MUST use the "save_artifact" tool to save this file.
        5. Verify the tool call returns a successful DB ID.
        `,
        priority: 9,
        assigned_to: 'trinity-mel', // Force assignment to verify Mel
        task_type: 'research'
    },
    {
        title: '[DIAGNOSIS] Test 2: Code Generation Artifact',
        description: `
        GOAL: Verify code artifact storage.
        INSTRUCTIONS:
        1. Generate a valid Python script named "hello_swarm.py".
        2. The script should print "Hello from the Swarm" and the current date.
        3. Use "save_artifact" with type="code".
        `,
        priority: 9,
        assigned_to: 'trinity-hdm',
        task_type: 'code'
    },
    {
        title: '[DIAGNOSIS] Test 3: Spreadsheet/CSV Data',
        description: `
        GOAL: Verify structured data artifact.
        INSTRUCTIONS:
        1. Create a CSV string representing a mock budget: "Item,Cost\nServer,50\nAPI,20".
        2. Save this as an artifact using "save_artifact" with type="data".
        `,
        priority: 9,
        assigned_to: 'trinity-apm',
        task_type: 'data'
    }
];
async function seedDiagnosis() {
    console.log('🧪 Seeding DIAGNOSIS Tasks...');
    for (const task of DIAGNOSIS_TASKS) {
        const { error } = await supabase.from('trinity_tasks').insert({
            ...task,
            status: 'pending',
            created_at: new Date().toISOString()
        });
        if (error)
            console.error(`❌ Failed to seed ${task.title}:`, error.message);
        else
            console.log(`✅ Seeded: ${task.title}`);
    }
    console.log('✨ Diagnosis Tasks Ready. Watch the Agents pick them up.');
}
seedDiagnosis();
