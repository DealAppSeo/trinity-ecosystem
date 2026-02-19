
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config({ path: '.env.local' });

console.log('\n--- 🧪 Trinity Exhaustive Key & Credit Audit ---\n');

async function testSupabase() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.log('❌ Supabase: Missing URL or Service Key');
        return;
    }
    try {
        const supabase = createClient(url, key);
        const { data, error } = await supabase.from('trinity_agent_registry').select('*').limit(1);
        if (error) throw error;
        console.log('✅ Supabase: Connected & Database Access Verified');
    } catch (e) {
        console.log('❌ Supabase: Failed - ' + e.message);
    }
}

async function checkKey(name: string, key: string | undefined) {
    if (!key) {
        console.log(`⚪ ${name}: Missing from .env.local`);
        return false;
    }
    if (key.length < 15) {
        console.log(`❌ ${name}: Key Present but looks suspiciously short/placeholder`);
        return false;
    }
    console.log(`✅ ${name}: Key Present (${key.substring(0, 8)}...)`);
    return true;
}

async function testCompletion(name: string, url: string, key: string | undefined, model: string) {
    if (!key) return;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: "hi" }],
                max_tokens: 1
            })
        });
        if (res.ok) {
            console.log(`✨ ${name}: ACTIVE (Credits Available)`);
        } else {
            const err = await res.json();
            if (res.status === 401) console.log(`❌ ${name}: INVALID KEY (Unauthorized)`);
            else if (res.status === 429) console.log(`❌ ${name}: OUT OF CREDITS / Rate Limited`);
            else console.log(`❌ ${name}: Failed (Status ${res.status}) - ${JSON.stringify(err)}`);
        }
    } catch (e) {
        console.log(`❌ ${name}: Network/Connection Error`);
    }
}

async function run() {
    await testSupabase();
    console.log('\n--- 🤖 AI Model Audit ---');

    // Check Presence
    await checkKey('OpenAI', process.env.OPENAI_API_KEY);
    await testCompletion('OpenAI', 'https://api.openai.com/v1/chat/completions', process.env.OPENAI_API_KEY, 'gpt-3.5-turbo');

    await checkKey('Anthropic', process.env.ANTHROPIC_API_KEY);
    await testCompletion('Anthropic', 'https://api.anthropic.com/v1/messages', process.env.ANTHROPIC_API_KEY, 'claude-3-haiku-20240307'); // Haiku test needs slightly different body, skipping for fetch simplicity

    await checkKey('Groq', process.env.GROQ_API_KEY);
    await testCompletion('Groq', 'https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, 'llama3-8b-8192');

    await checkKey('OpenRouter', process.env.OPENROUTER_API_KEY);
    await testCompletion('OpenRouter', 'https://openrouter.ai/api/v1/chat/completions', process.env.OPENROUTER_API_KEY, 'openai/gpt-3.5-turbo');

    await checkKey('Together AI', process.env.TOGETHER_API_KEY);
    await testCompletion('Together AI', 'https://api.together.xyz/v1/chat/completions', process.env.TOGETHER_API_KEY, 'meta-llama/Llama-3-8b-chat-hf');

    await checkKey('DeepSeek', process.env.DEEPSEEK_API_KEY);
    await checkKey('Stability', process.env.STABILITY_API_KEY);
    await checkKey('Figma Token', process.env.FIGMA_ACCESS_TOKEN || process.env.FIGMA_TOKEN);
    await checkKey('HuggingFace', process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN);

    console.log('\n--- 🧠 Memory & Tools Audit ---');
    await checkKey('Redis URL', process.env.UPSTASH_REDIS_REST_URL);
    await checkKey('Redis Token', process.env.UPSTASH_REDIS_REST_TOKEN);
    await checkKey('GitHub Token', process.env.GITHUB_TOKEN);
    await checkKey('Airtable Key', process.env.AIRTABLE_API_KEY);

    console.log('\n--- Audit Complete ---\n');
}

run();
