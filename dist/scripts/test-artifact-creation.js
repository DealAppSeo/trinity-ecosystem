"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function insertTestTask() {
    const { data, error } = await supabase.from('trinity_tasks').insert({
        title: '[SYSTEM] Artifact Capability Test',
        description: 'Create a test artifact to verify write permissions. Please generate a short poem about resilience.',
        task_type: 'content',
        priority: 10,
        assigned_to: 'MEL', // One of the active agents
        status: 'pending'
    }).select();
    if (error)
        console.error('Error:', error);
    else
        console.log('Task inserted:', data);
}
insertTestTask();
