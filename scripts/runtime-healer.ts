
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
runHealer().catch(console.error);
