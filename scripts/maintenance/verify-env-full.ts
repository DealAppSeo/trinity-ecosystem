
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

dotenv.config({ path: '.env.local' });

console.log('\n--- 🔍 Trinity Ecosystem Env Audit ---\n');

async function testSupabase() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.log('❌ Supabase: Missing URL or Service Key');
        return;
    }
    try {
        const supabase = createClient(url, key);
        const { data, error } = await supabase.table('trinity_agent_registry').select('count', { count: 'exact', head: true });
        if (error) throw error;
        console.log('✅ Supabase: Connected & Functional');
    } catch (e) {
        console.log('❌ Supabase: Connection Failed - ' + e.message);
    }
}

async function testRedis() {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        console.log('❌ Upstash Redis: Missing URL or Token');
        return;
    }
    try {
        const res = await fetch(`${url}/ping`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.result === 'PONG') {
            console.log('✅ Upstash Redis: Connected & Responsive');
        } else {
            console.log('❌ Upstash Redis: Unexpected Response');
        }
    } catch (e) {
        console.log('❌ Upstash Redis: Connection Failed');
    }
}

async function testAirtable() {
    const key = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    if (!key || !baseId) {
        console.log('❌ Airtable: Missing Key or Base ID');
        return;
    }
    try {
        const res = await fetch(`https://api.airtable.com/v0/${baseId}/Strategic%20Backlog?maxRecords=1`, {
            headers: { Authorization: `Bearer ${key}` }
        });
        if (res.ok) {
            console.log('✅ Airtable: API Key & Base Verified');
        } else {
            console.log(`❌ Airtable: Failed (Status ${res.status})`);
        }
    } catch (e) {
        console.log('❌ Airtable: Request Failed');
    }
}

async function checkLLMs() {
    const keys = {
        'Anthropic': process.env.ANTHROPIC_API_KEY,
        'OpenAI': process.env.OPENAI_API_KEY,
        'Groq': process.env.GROQ_API_KEY,
        'DeepSeek': process.env.DEEPSEEK_API_KEY
    };

    for (const [name, key] of Object.entries(keys)) {
        if (!key) {
            console.log(`❌ ${name}: Missing`);
        } else if (key.length < 10) {
            console.log(`❌ ${name}: Key seems too short/invalid`);
        } else {
            console.log(`✅ ${name}: Key Present (${key.substring(0, 10)}...)`);
        }
    }
}

async function run() {
    await testSupabase();
    await testRedis();
    await testAirtable();
    await checkLLMs();
    console.log('\n--- End of Audit ---\n');
}

run();
