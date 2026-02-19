import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testKeys() {
    console.log('🧪 Testing LLM API Keys...');

    const tests = [
        { name: 'OpenAI', url: 'https://api.openai.com/v1/chat/completions', key: process.env.OPENAI_API_KEY, body: { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] } },
        { name: 'Anthropic', url: 'https://api.anthropic.com/v1/messages', key: process.env.ANTHROPIC_API_KEY, body: { model: 'claude-3-5-sonnet-latest', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }, headers: { 'anthropic-version': '2023-06-01' } },
        { name: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: process.env.GROQ_API_KEY, body: { model: 'llama-3.1-70b-versatile', messages: [{ role: 'user', content: 'hi' }] } }
    ];

    for (const test of tests) {
        if (!test.key) {
            console.log(`❌ ${test.name}: Key MISSING`);
            continue;
        }

        console.log(`📡 Testing ${test.name} (Key ends in ...${test.key.slice(-5)})...`);
        try {
            const headers: any = { 'Content-Type': 'application/json' };
            if (test.name === 'Anthropic') {
                headers['x-api-key'] = test.key;
                Object.assign(headers, test.headers);
            } else {
                headers['Authorization'] = `Bearer ${test.key}`;
            }

            const res = await fetch(test.url, {
                method: 'POST',
                headers,
                body: JSON.stringify(test.body)
            });

            const text = await res.text();
            if (res.ok) {
                console.log(`✅ ${test.name}: SUCCESS!`);
            } else {
                console.log(`❌ ${test.name}: FAILED (${res.status})`);
                console.log(`   Response: ${text}`);
            }
        } catch (e: any) {
            console.log(`💥 ${test.name}: ERROR: ${e.message}`);
        }
        console.log('---');
    }
}

testKeys();
