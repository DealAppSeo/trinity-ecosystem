import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function diagnose() {
    const results: any[] = [];
    const tests = [
        { name: 'OpenAI', url: 'https://api.openai.com/v1/chat/completions', key: process.env.OPENAI_API_KEY, body: { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] } },
        { name: 'Anthropic', url: 'https://api.anthropic.com/v1/messages', key: process.env.ANTHROPIC_API_KEY, body: { model: 'claude-3-5-sonnet-20240620', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }, headers: { 'anthropic-version': '2023-06-01' } },
        { name: 'Cerebras', url: 'https://api.cerebras.ai/v1/chat/completions', key: process.env.CEREBRAS_API_KEY, body: { model: 'llama3.1-8b', messages: [{ role: 'user', content: 'hi' }] } },
        { name: 'DeepSeek', url: 'https://api.deepseek.com/chat/completions', key: process.env.DEEPSEEK_API_KEY, body: { model: 'deepseek-chat', messages: [{ role: 'user', content: 'hi' }] } }
    ];

    for (const test of tests) {
        let status = 'SUCCESS';
        let detail = '';
        try {
            const headers: any = { 'Content-Type': 'application/json' };
            if (test.name === 'Anthropic') {
                headers['x-api-key'] = test.key;
                Object.assign(headers, test.headers);
            } else {
                headers['Authorization'] = `Bearer ${test.key}`;
            }

            const res = await fetch(test.url, { method: 'POST', headers, body: JSON.stringify(test.body) });
            detail = await res.text();
            if (!res.ok) status = `FAILED (${res.status})`;
        } catch (e: any) {
            status = 'ERROR';
            detail = e.message;
        }
        results.push({ name: test.name, status, detail, key_preview: test.key ? `...${test.key.slice(-5)}` : 'MISSING' });
    }

    fs.writeFileSync('llm_diagnosis.json', JSON.stringify(results, null, 2));
    console.log('Results written to llm_diagnosis.json');
}

diagnose();
