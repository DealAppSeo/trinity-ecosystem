
const fs = require('fs');
const path = require('path');

// Node 18+ has global fetch, so we don't need node-fetch if running on Node 18+
// However, to be safe, we can polyfill or just assume it's there.
if (typeof fetch === 'undefined') {
    try {
        global.fetch = require('node-fetch');
    } catch (e) {
        console.error('fetch is not defined. Please use Node 18+ or install node-fetch.');
    }
}


console.log('\n--- 🕵️ Trinity Comprehensive API Key Audit ---\n');

const auditResults = [];
const logResult = (msg) => {
    console.log(msg);
    auditResults.push(msg);
};

// 1. Load Environment
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
        if (line.includes('=') && !line.trim().startsWith('#')) {
            const parts = line.split('=');
            const key = parts[0].trim();
            const val = parts.slice(1).join('=').trim();
            process.env[key] = val;
        }
    });
}

const serpKeys = Object.keys(process.env).filter(k => k.toLowerCase().includes('serp'));
logResult(`🔍 Detected SERP keys: ${JSON.stringify(serpKeys)}`);

async function testGeneric(name, url, key, body, headers = {}) {
    if (!key) {
        logResult(`⚪ ${name}: Missing key`);
        return;
    }
    const masked = `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
    try {
        const fetchHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
            ...headers
        };
        if (name === 'Anthropic') {
            delete fetchHeaders['Authorization'];
            fetchHeaders['x-api-key'] = key;
            fetchHeaders['anthropic-version'] = '2023-06-01';
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: fetchHeaders,
            body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined
        });

        if (res.ok) {
            logResult(`✅ ${name}: WORKING (${masked})`);
        } else {
            const status = res.status;
            let errorText = '';
            try {
                const err = await res.json();
                errorText = JSON.stringify(err);
            } catch (e) {
                errorText = await res.text();
            }
            if (status === 401) logResult(`❌ ${name}: INVALID (Unauthorized) (${masked})`);
            else if (status === 402 || status === 429) logResult(`❌ ${name}: NO CREDITS / Rate Limited (${masked})`);
            else logResult(`❌ ${name}: FAILED (Status ${status}) - ${errorText.substring(0, 100)}... (${masked})`);
        }
    } catch (e) {
        logResult(`❌ ${name}: ERROR - ${e.message} (${masked})`);
    }
}

async function run() {
    // OpenAI
    await testGeneric('OpenAI', 'https://api.openai.com/v1/chat/completions', process.env.OPENAI_API_KEY, {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1
    });

    // Anthropic
    await testGeneric('Anthropic', 'https://api.anthropic.com/v1/messages', process.env.ANTHROPIC_API_KEY, {
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
    });

    // Groq
    await testGeneric('Groq', 'https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, {
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1
    });

    // DeepSeek
    await testGeneric('DeepSeek', 'https://api.deepseek.com/chat/completions', process.env.DEEPSEEK_API_KEY, {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1
    });

    // SerpApi
    const serpKey = process.env.SERP_API_KEY || process.env.SERP_API_Key || process.env.SERPAPI_API_KEY;
    if (serpKey) {
        try {
            const sRes = await fetch(`https://serpapi.com/search.json?q=test&api_key=${serpKey}`);
            if (sRes.ok) logResult(`✅ SerpApi: WORKING (${serpKey.substring(0, 8)}...)`);
            else logResult(`❌ SerpApi: FAILED (${sRes.status})`);
        } catch (e) {
            logResult(`❌ SerpApi: ERROR - ${e.message}`);
        }
    } else {
        logResult('⚪ SerpApi: Missing');
    }

    // Figma
    const fKey = process.env.FIGMA_ACCESS_TOKEN || process.env.FIGMA_TOKEN;
    if (fKey) {
        try {
            const fRes = await fetch('https://api.figma.com/v1/me', { headers: { 'X-Figma-Token': fKey } });
            if (fRes.ok) logResult('✅ Figma: WORKING');
            else logResult(`❌ Figma: INVALID (${fRes.status})`);
        } catch (e) {
            logResult('❌ Figma: ERROR');
        }
    } else {
        logResult('⚪ Figma: Missing');
    }

    fs.writeFileSync('audit_report.txt', auditResults.join('\n'));
    console.log('\n--- 🏁 Audit Complete (Saved to audit_report.txt) ---');
}

run();
