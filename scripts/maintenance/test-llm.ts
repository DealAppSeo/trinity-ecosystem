
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testProvider(name: string, url: string, key: string, model: string, bodyProvider: (m: string) => any) {
    console.log(`\n📡 Testing ${name}...`);
    if (!key) {
        console.log(`⚠️ Skiping ${name}: Key missing in .env.local`);
        return;
    }

    try {
        const start = Date.now();
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`,
                'x-api-key': key, // for Anthropic
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(bodyProvider(model))
        });

        const data = await response.json();
        const duration = Date.now() - start;

        if (response.ok) {
            console.log(`✅ ${name} OK (${duration}ms)`);
        } else {
            console.log(`❌ ${name} FAILED: ${JSON.stringify(data.error || data)}`);
        }
    } catch (e: any) {
        console.log(`💥 ${name} ERROR: ${e.message}`);
    }
}

async function runAudit() {
    console.log('🧪 Starting Global LLM Audit (Direct Fetch)...');

    // OpenAI
    await testProvider('OpenAI', 'https://api.openai.com/v1/chat/completions', process.env.OPENAI_API_KEY!, 'gpt-4o-mini', (m) => ({
        model: m, messages: [{ role: 'user', content: 'hi' }]
    }));

    // Anthropic
    await testProvider('Anthropic', 'https://api.anthropic.com/v1/messages', process.env.ANTHROPIC_API_KEY!, 'claude-3-haiku-20240307', (m) => ({
        model: m, max_tokens: 10, messages: [{ role: 'user', content: 'hi' }]
    }));

    // Groq
    await testProvider('Groq', 'https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY!, 'llama-3.1-8b-instant', (m) => ({
        model: m, messages: [{ role: 'user', content: 'hi' }]
    }));

    // DeepSeek
    await testProvider('DeepSeek', 'https://api.deepseek.com/chat/completions', process.env.DEEPSEEK_API_KEY!, 'deepseek-chat', (m) => ({
        model: m, messages: [{ role: 'user', content: 'hi' }]
    }));

    // OpenRouter
    await testProvider('OpenRouter', 'https://openrouter.ai/api/v1/chat/completions', process.env.OPENROUTER_API_KEY!, 'google/gemini-flash-1.5', (m) => ({
        model: m, messages: [{ role: 'user', content: 'hi' }]
    }));
}

runAudit();
