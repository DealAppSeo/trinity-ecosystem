"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: '.env.local' });
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function resetAndTrigger() {
    console.log('⚡ RESETTING SPRINT TASK TO PENDING...');
    const { data: tasks, error: taskError } = await supabase
        .from('trinity_tasks')
        .select('*')
        .ilike('title', '%SPRINT%Generate 200%')
        .single();
    if (tasks) {
        console.log(`Resetting task ${tasks.id} (Current: ${tasks.status})`);
        const { error } = await supabase
            .from('trinity_tasks')
            .update({
            status: 'pending', // AGENT ONLY POLLS PENDING
            assigned_to: 'trinity-sophia',
            started_at: null
        })
            .eq('id', tasks.id);
        if (error)
            console.error('❌ Reset failed:', error.message);
        else
            console.log('✅ Task Reset to PENDING. Sophia should pick it up in <15s.');
    }
    else {
        console.error('❌ Sprint task not found.');
    }
}
resetAndTrigger();
