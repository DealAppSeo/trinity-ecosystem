import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testOpenAI() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return;
    console.log('\n--- Testing OpenAI ---');
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })
        });
        const data = await response.json();
        console.log(`GPT-4o-Mini: ${response.status}`, data.error ? data.error.message : 'SUCCESS');
    } catch (e: any) { console.log(`OpenAI Error: ${e.message}`); }
}

async function testAnthropic() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return;
    console.log('\n--- Testing Anthropic ---');
    const models = ['claude-3-5-sonnet-latest', 'claude-3-5-sonnet-20241022', 'claude-3-5-sonnet-20240620', 'claude-3-7-sonnet-latest'];
    for (const model of models) {
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify({ model, max_tokens: 10, messages: [{ role: 'user', content: 'hello' }] })
            });
            const data = await response.json();
            console.log(`Model ${model}: ${response.status}`, data.error ? data.error.message : 'SUCCESS');
            if (!data.error) break; // Stop at first working model
        } catch (e: any) { console.log(`Anthropic Error: ${e.message}`); }
    }
}

async function testGemini() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return;
    console.log('\n--- Testing Gemini ---');
    const endpoints = ['v1beta', 'v1'];
    const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'];
    for (const model of models) {
        for (const ep of endpoints) {
            try {
                const url = `https://generativelanguage.googleapis.com/${ep}/models/${model}:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] })
                });
                const data = await response.json();
                console.log(`Model ${model} (${ep}): ${response.status}`, data.error ? data.error.message : 'SUCCESS');
                if (!data.error) return; // Stop at first working
            } catch (e: any) { console.log(`Gemini Error: ${e.message}`); }
        }
    }
}

async function testTavily() {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return;
    console.log('\n--- Testing Tavily ---');
    try {
        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: apiKey, query: 'test', search_depth: 'basic' })
        });
        const data = await response.json();
        console.log(`Tavily: ${response.status}`, data.error ? data.error : 'SUCCESS');
    } catch (e: any) { console.log(`Tavily Error: ${e.message}`); }
}

async function runAll() {
    await testOpenAI();
    await testAnthropic();
    await testGemini();
    await testTavily();
    console.log('\n--- Diagnostics Complete ---');
}

runAll();
