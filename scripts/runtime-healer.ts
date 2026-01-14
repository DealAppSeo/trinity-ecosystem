
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { smartLLM } from '../lib/llm';
import { computeAnfisScore } from '../lib/anfis';

// Trusted Service Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function runHealer() {
    console.log('🩺 Trinity Healer (v2.1 - AI Enhanced) Starting...');

    // 1. Fetch Status of Memory
    const { data: errors, error } = await supabase
        .from('trinity_runtime_errors')
        .select('*')
        .eq('status', 'pending')
        .limit(5);

    if (error) {
        console.error('❌ Failed to fetch errors:', error.message);
        return;
    }

    if (!errors || errors.length === 0) {
        console.log('✅ No pending wounds found. Cluster healthy.');
        return;
    }

    console.log(`🩹 Found ${errors.length} injuries. Beginning Triage...`);

    for (const err of errors) {
        console.log(`\n🔍 Analyzing Error [${err.id}]: ${err.error_message?.substring(0, 50)}...`);

        // 2. ANFIS SCORING (Triage)
        // Hardcoded frequency for now (v2.2 will query history)
        const mockFrequency = Math.random() < 0.2 ? 0.8 : 0.1;
        // Estimate severity from keywords
        let severity = 0.3;
        const msg = (err.error_message || '').toLowerCase();
        if (msg.includes('fatal') || msg.includes('crash') || msg.includes('connection')) severity = 0.9;
        if (msg.includes('undefined') || msg.includes('null')) severity = 0.6;

        const anfisResult = computeAnfisScore({ severity, frequency: mockFrequency, complexity: 0.5 });
        console.log(`🧠 ANFIS Score: ${anfisResult.priorityScore.toFixed(1)} -> Action: ${anfisResult.action} (${anfisResult.explanation})`);

        if (anfisResult.action === 'IGNORE') {
            console.log('⏩ Skipping minor issue.');
            await supabase.from('trinity_runtime_errors').update({ status: 'ignored', resolution_notes: anfisResult.explanation }).eq('id', err.id);
            continue;
        }

        // 3. LLM DIAGNOSIS (The Brain)
        console.log('💊 Requesting AI Diagnosis...');
        const prompt = `
        APPLICATION ERROR REPORT:
        Message: ${err.error_message}
        Stack Trace: ${err.component_stack}
        URL: ${err.url}

        TASK:
        1. Analyze the root cause.
        2. Propose a specific code fix.
        3. Rate confidence (0-100%).
        
        Keep it concise.
        `;

        const llmResult = await smartLLM({
            systemPrompt: "You are Trinity Healer, an expert TypeScript engineer specialized in Next.js and Supabase.",
            userPrompt: prompt
        });

        const fixProposal = llmResult.output;
        console.log(`💡 AI Proposal: ${fixProposal.substring(0, 100)}...`);

        // 4. Update Memory
        await supabase
            .from('trinity_runtime_errors')
            .update({
                status: 'analyzed',
                resolution_notes: `[ANFIS:${anfisResult.action}] [AI_FIX]: ${fixProposal}`,
                updated_at: new Date().toISOString()
            })
            .eq('id', err.id);

        console.log('✅ Diagnosis logged to Memory.');
    }
}

// Run immediately
// Run immediately
runHealer().catch(console.error);

// ==========================================
// V2.2 UPGRADE: DEPLOYMENT HEALER (BETA)
// ==========================================
async function healDeployment() {
    console.log('🏗️  Deployment Healer Active...');

    // 1. Check for Reports in DB (Pushed by Scout or Human)
    const { data: errors } = await supabase
        .from('trinity_deployment_errors')
        .select('*')
        .eq('status', 'pending');

    if (!errors || errors.length === 0) {
        // console.log('   (No pending deployment errors)'); // Quiet mode
        return;
    }

    console.log(`🩹 Found ${errors.length} deployment failures. analyzing...`);

    for (const err of errors) {
        console.log(`\n🔍 Analyzing Build Error [${err.id}]: ${err.error_message?.substring(0, 50)}...`);

        // 2. AI Analysis
        const prompt = `
        DEPLOYMENT FAILURE REPORT:
        Message: ${err.error_message}
        Context: ${err.component_stack || 'N/A'}
        
        TASK:
        1. Identify the root cause (e.g. Missing Env Var, TS Error, Docker config).
        2. Propose a precise fix (Shell command, Code diff, or Config change).
        3. Rate confidence (0-100%).
        `;

        const llmResult = await smartLLM({
            systemPrompt: "You are a DevOps Specialist for Next.js/Railway deployments.",
            userPrompt: prompt
        });

        const fixProposal = llmResult.output;
        console.log(`💡 AI Proposal: ${fixProposal.substring(0, 100)}...`);

        // 3. Log Result
        await supabase
            .from('trinity_deployment_errors')
            .update({
                status: 'analyzed',
                resolution_notes: `[AI_FIX]: ${fixProposal}`,
                updated_at: new Date().toISOString()
            })
            .eq('id', err.id);
    }
}
healDeployment().catch(console.error);
