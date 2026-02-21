import * as dotenv from 'dotenv';
import * as path from 'path';
import fetch from 'node-fetch';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import Redis from 'ioredis';

async function checkRedis() {
    console.log("--- REDIS/DRAGONFLY DIAGNOSTIC ---");
    const dragonflyUrl = process.env.DRAGONFLY_DB_URL;
    const dragonflyPort = parseInt(process.env.DRAGONFLY_DB_PORT || '6385');
    const dragonflyKey = process.env.DRAGONFLY_ACCESS_KEY;

    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (dragonflyUrl && dragonflyKey) {
        console.log(`⚡ Testing Primary (DragonflyDB): ${dragonflyUrl}:${dragonflyPort}`);
        const redis = new Redis({
            host: dragonflyUrl,
            port: dragonflyPort,
            password: dragonflyKey,
            tls: {},
            connectTimeout: 5000
        });

        try {
            const start = Date.now();
            await redis.ping();
            const duration = Date.now() - start;
            console.log(`✅ Dragonfly is UP (${duration}ms)`);
            await redis.quit();
        } catch (e: any) {
            console.log(`❌ Dragonfly Connection Failed: ${e.message}`);
            await redis.disconnect();
        }
    }

    if (upstashUrl && upstashToken) {
        console.log(`🐢 Testing Fallback (Upstash REST): ${upstashUrl}`);
        try {
            const start = Date.now();
            const res = await fetch(upstashUrl, {
                headers: { 'Authorization': `Bearer ${upstashToken}` }
            });
            const duration = Date.now() - start;
            if (res.ok) {
                console.log(`✅ Upstash is reachable (${duration}ms)`);
            } else {
                console.log(`❌ Upstash Error: ${res.status} ${res.statusText}`);
            }
        } catch (e: any) {
            console.log(`❌ Upstash Connection Failed: ${e.message}`);
        }
    }
}

async function checkLLM(name: string, url: string, key: string | undefined, body: any) {
    console.log(`--- ${name.toUpperCase()} DIAGNOSTIC ---`);
    if (!key) {
        console.log(`❌ ${name.toUpperCase()}_API_KEY is missing.`);
        return;
    }
    console.log(`Key Prefix: ${key.substring(0, 5)}... (Length: ${key.length})`);
    try {
        const start = Date.now();
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify(body)
        });
        const duration = Date.now() - start;
        console.log(`Status: ${res.status} ${res.statusText} (${duration}ms)`);
        const data = await res.json();
        if (!res.ok) {
            console.log(`Error details: ${JSON.stringify(data).substring(0, 500)}`);
            if (res.status === 402) console.log("Reason: Insufficient Balance");
            else if (res.status === 401) console.log("Reason: Invalid/Expired Key");
            else if (res.status === 404) console.log("Reason: Endpoint/Model Not Found");
        } else {
            console.log(`✅ ${name.toUpperCase()} is healthy.`);
        }
    } catch (e: any) {
        console.log(`❌ ${name.toUpperCase()} Connection Failed: ${e.message}`);
    }
}

async function checkSupabase() {
    console.log("--- SUPABASE DIAGNOSTIC ---");
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.log("❌ Supabase credentials missing.");
        return;
    }
    try {
        const start = Date.now();
        const res = await fetch(`${url}/rest/v1/trinity_tasks?select=id&limit=1`, {
            headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
        });
        const duration = Date.now() - start;
        if (res.ok) console.log(`✅ Supabase is UP (${duration}ms)`);
        else console.log(`❌ Supabase Error: ${res.status}`);
    } catch (e: any) {
        console.log(`❌ Supabase Failed: ${e.message}`);
    }
}

async function checkSearchAPIs() {
    console.log("--- SEARCH & INTELLIGENCE ---");
    const apis = [
        { name: 'Tavily', url: 'https://api.tavily.com/search', key: process.env.TAVILY_API_KEY, body: { query: "hi" } },
        { name: 'Brave', url: 'https://api.search.brave.com/res/v1/web/search?q=hi', key: process.env.BRAVE_API_KEY, headers: { 'Accept': 'application/json', 'X-Subscription-Token': process.env.BRAVE_API_KEY! } },
        { name: 'SerpApi', url: `https://serpapi.com/search.json?q=hi&api_key=${process.env.SERP_API_KEY}`, key: process.env.SERP_API_KEY }
    ];

    for (const api of apis) {
        if (!api.key) {
            console.log(`❌ ${api.name} key missing.`);
            continue;
        }
        try {
            const start = Date.now();
            const res = await fetch(api.url, {
                method: api.body ? 'POST' : 'GET',
                headers: api.headers || { 'Authorization': `Bearer ${api.key}`, 'Content-Type': 'application/json' },
                body: api.body ? JSON.stringify(api.body) : undefined
            });
            const duration = Date.now() - start;
            if (res.ok) console.log(`✅ ${api.name} is Healthy (${duration}ms)`);
            else console.log(`❌ ${api.name} Error: ${res.status}`);
        } catch (e: any) {
            console.log(`❌ ${api.name} Failed: ${e.message}`);
        }
    }
}

async function checkIntegrations() {
    console.log("--- BUSINESS & DEV INTEGRATIONS ---");
    // GitHub
    if (process.env.GITHUB_TOKEN) {
        try {
            const res = await fetch('https://api.github.com/user', {
                headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}` }
            });
            if (res.ok) console.log("✅ GitHub Token: Valid");
            else console.log(`❌ GitHub Error: ${res.status}`);
        } catch (e) { console.log("❌ GitHub Failed"); }
    }

    // Airtable
    if (process.env.AIRTABLE_API_KEY) {
        try {
            const res = await fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Tasks?maxRecords=1`, {
                headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}` }
            });
            if (res.ok) console.log("✅ Airtable: Healthy");
            else console.log(`❌ Airtable Error: ${res.status}`);
        } catch (e) { console.log("❌ Airtable Failed"); }
    }
}

async function runDiagnostics() {
    await checkSupabase();
    console.log("");
    await checkRedis();
    console.log("");
    await checkSearchAPIs();
    console.log("");
    await checkIntegrations();
    console.log("");

    console.log("--- LLM LAYER ---");
    // DeepInfra
    await checkLLM('DeepInfra', 'https://api.deepinfra.com/v1/openai/chat/completions', process.env.DEEPINFRA_API_KEY, {
        model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5
    });
    // SiliconFlow
    await checkLLM('SiliconFlow-CN-V3', 'https://api.siliconflow.cn/v1/chat/completions', process.env.SILICONFLOW_API_KEY, {
        model: "deepseek-ai/DeepSeek-V3",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5
    });
    await checkLLM('SiliconFlow-COM-V3', 'https://api.siliconflow.com/v1/chat/completions', process.env.SILICONFLOW_API_KEY, {
        model: "deepseek-ai/DeepSeek-V3",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5
    });
    await checkLLM('SiliconFlow-R1', 'https://api.siliconflow.cn/v1/chat/completions', process.env.SILICONFLOW_API_KEY, {
        model: "deepseek-ai/DeepSeek-R1",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5
    });

    // Together
    await checkLLM('Together', 'https://api.together.xyz/v1/chat/completions', process.env.TOGETHER_API_KEY, {
        model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5
    });

    // Grok
    await checkLLM('Grok-2', 'https://api.x.ai/v1/chat/completions', process.env.GROK_API_KEY, {
        model: "grok-2",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5
    });
    await checkLLM('Grok-3', 'https://api.x.ai/v1/chat/completions', process.env.GROK_API_KEY, {
        model: "grok-3",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5
    });
    // Groq
    await checkLLM('Groq', 'https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, {
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5
    });
    // Cerebras
    await checkLLM('Cerebras', 'https://api.cerebras.ai/v1/chat/completions', process.env.CEREBRAS_API_KEY, {
        model: "llama3.1-8b",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5
    });
    // OpenAI & Anthropic (Fast checks)
    await checkLLM('OpenAI', 'https://api.openai.com/v1/chat/completions', process.env.OPENAI_API_KEY, {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5
    });
}

runDiagnostics().catch(console.error);
