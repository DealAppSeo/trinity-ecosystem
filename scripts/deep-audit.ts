
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config({ path: '.env.local' });

console.log('\n--- 🧪 Trinity Deep Connectivity & Credit Audit ---\n');

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

async function testRedis() {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        console.log('❌ Upstash Redis: Missing credentials');
        return;
    }
    try {
        const res = await fetch(`${url}/ping`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.result === 'PONG') {
            console.log('✅ Upstash Redis: Responsive (PONG)');
        } else {
            console.log('❌ Upstash Redis: Unexpected Response ' + JSON.stringify(data));
        }
    } catch (e) {
        console.log('❌ Upstash Redis: Connection Failed');
    }
}

async function testOpenAI() {
    if (!process.env.OPENAI_API_KEY) {
        console.log('❌ OpenAI: Key Missing');
        return;
    }
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 5
        });
        console.log('✅ OpenAI: Active & Credits Available');
    } catch (e) {
        if (e.status === 401) console.log('❌ OpenAI: Invalid API Key');
        else if (e.status === 429) console.log('❌ OpenAI: Insufficient Credits / Quota Exceeded');
        else console.log('❌ OpenAI: Error ' + e.message);
    }
}

async function testAnthropic() {
    if (!process.env.ANTHROPIC_API_KEY) {
        console.log('❌ Anthropic: Key Missing');
        return;
    }
    try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        await anthropic.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 5,
            messages: [{ role: "user", content: "hi" }],
        });
        console.log('✅ Anthropic: Active & Credits Available');
    } catch (e) {
        if (e.status === 401) console.log('❌ Anthropic: Invalid API Key');
        else if (e.status === 429) console.log('❌ Anthropic: Insufficient Credits / Quota Exceeded');
        else console.log('❌ Anthropic: Error ' + e.message);
    }
}

async function testGroq() {
    if (!process.env.GROQ_API_KEY) {
        console.log('❌ Groq: Key Missing');
        return;
    }
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama3-8b-8192",
                messages: [{ role: "user", content: "hi" }],
                max_tokens: 5
            })
        });
        if (res.ok) console.log('✅ Groq: Active & Functional');
        else if (res.status === 401) console.log('❌ Groq: Invalid Key');
        else if (res.status === 429) console.log('❌ Groq: Rate Limit / Credits');
        else console.log(`❌ Groq: Failed (Status ${res.status})`);
    } catch (e) {
        console.log('❌ Groq: Request Failed');
    }
}

async function run() {
    await testSupabase();
    await testRedis();
    await testOpenAI();
    await testAnthropic();
    await testGroq();
    console.log('\n--- Audit Complete ---\n');
}

run();
