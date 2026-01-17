"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function runtimeHealer() {
    console.log('🚑 Trinity Runtime Healer Activating...');
    // 1. Fetch Pending Errors
    const { data: errors, error } = await supabase
        .from('trinity_runtime_errors')
        .select('*')
        .eq('status', 'pending')
        .limit(10);
    if (error) {
        console.error('❌ Failed to fetch errors:', error);
        return;
    }
    if (!errors || errors.length === 0) {
        console.log('✅ No pending runtime errors. System healthy.');
        return;
    }
    console.log(`⚠️ Found ${errors.length} pending errors. Analyzing...`);
    // 2. Group & Analyze
    const groupedErrors = {};
    errors.forEach(err => {
        const key = err.error_message || 'Unknown Error';
        if (!groupedErrors[key])
            groupedErrors[key] = [];
        groupedErrors[key].push(err);
    });
    for (const [msg, group] of Object.entries(groupedErrors)) {
        console.log(`\n🔍 Analyzing Cluster: "${msg}" (${group.length} occurrences)`);
        // Context
        const sample = group[0];
        const stack = sample.stack_trace ? sample.stack_trace.substring(0, 500) : 'No stack';
        // Diagnosis Logic (Simulated AI for now, can be hooked to LLM)
        let diagnosis = 'Unknown cause.';
        let prescription = 'Investigate manually.';
        let severity = 'low';
        if (msg.includes('toLowerCase')) {
            diagnosis = 'Type Error: Attempting to call string method on non-string value.';
            prescription = 'Wrap variable in String() or check for null/undefined before calling .toLowerCase().';
            severity = 'high';
        }
        else if (msg.includes('fetch') || msg.includes('network')) {
            diagnosis = 'Network Error: API or Resource unreachable.';
            prescription = 'Check network connectivity, CORS settings, or API endpoint status.';
            severity = 'medium';
        }
        console.log(`   🔸 Diagnosis: ${diagnosis}`);
        console.log(`   🔸 Prescription: ${prescription}`);
        // 3. Take Action (Create Task for Gamma Squad)
        if (severity === 'high' || group.length > 2) {
            const { data: taskData, error: taskError } = await supabase
                .from('trinity_tasks')
                .insert([{
                    title: `[AUTO-HEAL] Fix Runtime Error: ${msg.substring(0, 50)}...`,
                    description: `**Runtime Healer Analysis**\n\n**Error**: ${msg}\n**Occurrences**: ${group.length}\n**Diagnosis**: ${diagnosis}\n**Prescription**: ${prescription}\n**Stack Trace**: \`\`\`\n${stack}\n\`\`\``,
                    priority: 9, // Critical
                    status: 'pending',
                    task_type: 'self-healing',
                    assigned_to: 'trinity-hdm' // Assign to Healer/Builder
                }])
                .select()
                .single();
            if (taskError) {
                console.error('   ❌ Failed to create healing task:', taskError.message);
            }
            else {
                console.log(`   ✅ Healing Task Created: ${taskData.title} (ID: ${taskData.id})`);
                // 4. Mark Errors as 'processing'
                const ids = group.map(e => e.id);
                await supabase
                    .from('trinity_runtime_errors')
                    .update({ status: 'processing' })
                    .in('id', ids);
            }
        }
    }
}
// Run immediately for now, can be loop
runtimeHealer();
