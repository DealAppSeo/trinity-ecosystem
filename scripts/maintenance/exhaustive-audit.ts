
import * as fs from 'fs';
import * as path from 'path';

console.log('\n--- 🕵️ Trinity Exhaustive Ecosystem Audit (v2) ---\n');

const auditResults: any[] = [];
const logResult = (category: string, name: string, status: string, detail: string = '') => {
    const icon = status === '✅' ? 'WORKING' : status === '❌' ? 'FAILED' : 'MISSING';
    console.log(`[${category}] ${status} ${name}: ${detail}`);
    auditResults.push({ category, name, status, detail, icon });
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

async function testFetch(url: string, options: any, timeout = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (e: any) {
        clearTimeout(id);
        throw e;
    }
}

async function runAudit() {
    // CATEGORY: LLMs & AI
    const llms = [
        { name: 'OpenAI', key: process.env.OPENAI_API_KEY, url: 'https://api.openai.com/v1/chat/completions', body: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 } },
        { name: 'Anthropic', key: process.env.ANTHROPIC_API_KEY, url: 'https://api.anthropic.com/v1/messages', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01' }, body: { model: 'claude-3-haiku-20240307', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 } },
        { name: 'Groq', key: process.env.GROQ_API_KEY, url: 'https://api.groq.com/openai/v1/chat/completions', body: { model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 } },
        { name: 'DeepSeek', key: process.env.DEEPSEEK_API_KEY, url: 'https://api.deepseek.com/chat/completions', body: { model: 'deepseek-chat', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 } },
        { name: 'Cerebras', key: process.env.CEREBRAS_API_KEY, url: 'https://api.cerebras.ai/v1/chat/completions', body: { model: 'llama3.1-8b', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 } },
        { name: 'OpenRouter', key: process.env.OPENROUTER_API_KEY, url: 'https://openrouter.ai/api/v1/chat/completions', body: { model: 'anthropic/claude-3-haiku', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 } },
        { name: 'Perplexity', key: process.env.PERPLEXITY_API_KEY, url: 'https://api.perplexity.ai/chat/completions', body: { model: 'llama-3.1-sonar-small-128k-online', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 } },
        { name: 'Cohere', key: process.env.COHERE_API_KEY, url: 'https://api.cohere.ai/v1/chat/completions', body: { model: 'command-r-plus', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 } },
        { name: 'Google Gemini', key: process.env.GEMINI_API_KEY, url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, body: { contents: [{ parts: [{ text: 'hi' }] }] } },
        { name: 'StabilityAI', key: process.env.STABILITY_API_KEY, url: 'https://api.stability.ai/v1/user/account' },
    ];

    for (const llm of llms) {
        if (!llm.key) {
            logResult('LLM', llm.name, '⚪', 'Missing Key');
            continue;
        }
        try {
            const headers: any = { 'Content-Type': 'application/json', ...llm.headers };
            if (!headers['Authorization'] && !headers['x-api-key'] && llm.name !== 'Google Gemini') {
                headers['Authorization'] = `Bearer ${llm.key}`;
            }
            const res = await testFetch(llm.url, {
                method: llm.body ? 'POST' : 'GET',
                headers,
                body: llm.body ? JSON.stringify(llm.body) : undefined
            });
            if (res.ok) logResult('LLM', llm.name, '✅', 'Working');
            else {
                const errText = await res.text();
                let errMsg = errText;
                try {
                    const errJson = JSON.parse(errText);
                    errMsg = errJson.error?.message || errJson.message || errText;
                } catch (e) { }
                logResult('LLM', llm.name, '❌', `Status ${res.status}: ${errMsg.substring(0, 50)}...`);
            }
        } catch (e: any) {
            logResult('LLM', llm.name, '❌', `Error: ${e.message}`);
        }
    }

    // CATEGORY: Search & Research
    const search = [
        { name: 'Tavily', key: process.env.TAVILY_API_KEY, url: 'https://api.tavily.com/search', body: { api_key: process.env.TAVILY_API_KEY, query: 'test' } },
        { name: 'SerpApi', key: process.env.SERP_API_KEY, url: `https://serpapi.com/search.json?q=test&api_key=${process.env.SERP_API_KEY}` },
        { name: 'SerperAI', key: process.env.SERPER_API_KEY, url: 'https://google.serper.dev/search', headers: { 'X-API-KEY': process.env.SERPER_API_KEY || '' }, body: { q: 'test' } },
        { name: 'You.com', key: process.env.YOU_COM_API_KEY, url: 'https://api.ydc-index.io/search?query=test', headers: { 'X-API-Key': process.env.YOU_COM_API_KEY || '' } },
        { name: 'Brave', key: process.env.BRAVE_API_KEY, url: 'https://api.search.brave.com/res/v1/web/search?q=test', headers: { 'X-Subscription-Token': process.env.BRAVE_API_KEY || '' } },
    ];

    for (const s of search) {
        if (!s.key) {
            logResult('SEARCH', s.name, '⚪', 'Missing Key');
            continue;
        }
        try {
            const res = await testFetch(s.url, {
                method: s.body ? 'POST' : 'GET',
                headers: { 'Content-Type': 'application/json', ...s.headers },
                body: s.body ? JSON.stringify(s.body) : undefined
            });
            if (res.ok) logResult('SEARCH', s.name, '✅', 'Working');
            else logResult('SEARCH', s.name, '❌', `Status ${res.status}`);
        } catch (e: any) {
            logResult('SEARCH', s.name, '❌', `Error: ${e.message}`);
        }
    }

    // CATEGORY: Services & Infra
    const services = [
        { name: 'Supabase', key: process.env.SUPABASE_SERVICE_ROLE_KEY, url: `${process.env.SUPABASE_URL}/rest/v1/trinity_agent_registry?select=count`, headers: { 'apikey': process.env.SUPABASE_ANON_KEY || '', 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } },
        { name: 'Airtable', key: process.env.AIRTABLE_API_KEY, url: 'https://api.airtable.com/v0/meta/bases', headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}` } },
        { name: 'Upstash Redis', key: process.env.UPSTASH_REDIS_REST_TOKEN, url: `${process.env.UPSTASH_REDIS_REST_URL}/ping`, headers: { 'Authorization': `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } },
        { name: 'Figma', key: process.env.FIGMA_ACCESS_TOKEN, url: 'https://api.figma.com/v1/me', headers: { 'X-Figma-Token': process.env.FIGMA_ACCESS_TOKEN || '' } },
        { name: 'Github', key: process.env.GITHUB_TOKEN, url: 'https://api.github.com/user', headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}`, 'User-Agent': 'Trinity-Audit' } },
        { name: 'Portkey', key: process.env.PORTKEY_API_KEY, url: 'https://api.portkey.ai/v1/ping', headers: { 'x-portkey-api-key': process.env.PORTKEY_API_KEY || '' } },
        { name: 'Flowise', key: process.env.FLOWISE_API_KEY, url: 'https://flowiseai.com/api/v1/version' }, // Placeholder for check
    ];

    for (const svc of services) {
        if (!svc.key) {
            logResult('SERVICE', svc.name, '⚪', 'Missing Key');
            continue;
        }
        try {
            const res = await testFetch(svc.url, { headers: svc.headers });
            if (res.ok) logResult('SERVICE', svc.name, '✅', 'Working');
            else logResult('SERVICE', svc.name, '❌', `Status ${res.status}`);
        } catch (e: any) {
            logResult('SERVICE', svc.name, '❌', `Error: ${e.message}`);
        }
    }

    // GAPS ANALYSIS
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const requiredAbilities = [
        { name: 'Spreadsheets', pkg: ['xlsx', 'exceljs'], status: '⚪', detail: 'Missing' },
        { name: 'Word Documents', pkg: ['docx'], status: '⚪', detail: 'Missing' },
        { name: 'PDF Reports', pkg: ['pdfkit', 'jspdf'], status: '⚪', detail: 'Missing' },
        { name: 'Image Editing', pkg: ['sharp', 'canvas'], status: '⚪', detail: 'Missing' },
        { name: 'Markdown Parsing', pkg: ['markdown-it'], status: '⚪', detail: 'Missing' },
        { name: 'Automation (n8n)', pkg: ['n8n-nodes-base'], status: '⚪', detail: 'Manual Check Needed' },
    ];

    for (const ability of requiredAbilities) {
        const installed = ability.pkg.find(p => deps[p]);
        if (installed) {
            ability.status = '✅';
            ability.detail = `Found (${installed})`;
        } else {
            ability.status = '❌';
            ability.detail = `Gaps: Need ${ability.pkg.join(' or ')}`;
        }
        logResult('GAP', ability.name, ability.status, ability.detail);
    }

    // 4. Summarize Report
    const report = auditResults.map(r => `${r.status} [${r.category}] ${r.name}: ${r.detail}`).join('\n');
    fs.writeFileSync('exhaustive_audit_report.txt', report);
    console.log('\n--- 🏁 Exhaustive Audit Complete (Saved to exhaustive_audit_report.txt) ---');
}

runAudit();
