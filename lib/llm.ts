
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); // Ensure env loaded
import { mcpManager } from './mcp/MCPManager';
import { supabase } from './supabase';
import { recordProviderHealth } from './agent/provider_health';
import { IntelligenceRouter } from './agent/IntelligenceRouter';
import { UnifiedServiceRegistry } from './agent/UnifiedServiceRegistry';
import { AggregatorManager } from './llm/AggregatorManager';
import { Task } from './agent/types';

export interface LLMRequest {
    systemPrompt: string;
    userPrompt: string;
    model?: string;
    role?: string; // For tool permissions
    tools?: boolean; // Enable tools?
    task?: Task; // Context for routing
}

export interface LLMResult {
    output: string;
    toolCalls?: number;
}

const DAILY_LIMIT = 5000; // Increased for Global Brain scale

async function checkBudget(provider: string): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
        .from('trinity_usage')
        .select('calls')
        .eq('date', today)
        .eq('provider', provider)
        .single();

    const used = data?.calls || 0;
    return used < DAILY_LIMIT;
}

/**
 * Universal LLM Caller with ANFIS 2.0 Intelligent Routing.
 */
export async function smartLLM(request: LLMRequest): Promise<LLMResult> {
    const router = new IntelligenceRouter(request.role || 'trinity-core');
    const registry = UnifiedServiceRegistry.getInstance();
    const aggregator = AggregatorManager.getInstance();

    // 1. Get prioritized list of services (keys)
    // Default fallback list if router fails
    const staticFallbacks = ['openai-gpt-4o', 'anthropic-claude-3-5', 'deepseek-r1'];
    const priorities = await router.route(request.task || { title: 'General Request', description: '', status: 'todo' } as Task, staticFallbacks);

    let lastError = '';

    for (const serviceKey of priorities) {
        const info = registry.getServiceByKey(serviceKey);
        if (!info) continue;

        // Skip if budget exceeded for this provider
        if (!(await checkBudget(info.provider))) {
            console.warn(`[smartLLM] 🛑 Budget exceeded for ${info.provider}. Trying next...`);
            continue;
        }

        const startTime = Date.now();
        try {
            console.log(`[smartLLM] 🧠 Routing to: ${serviceKey} | Provider: ${info.provider} | Model: ${info.model_id}`);

            let res: LLMResult;

            // Route based on provider type
            if (aggregator.isSupported(info.provider)) {
                res = await aggregator.call(info.provider, info.model_id || '', request);
            } else if (info.provider === 'openai') {
                res = await callOpenAI(request, info.model_id || 'gpt-4o');
            } else if (info.provider === 'anthropic') {
                res = await callAnthropic(request, info.model_id || 'claude-3-5-sonnet-20241022');
            } else if (info.provider === 'gemini') {
                res = await callGemini(request, info.model_id || 'gemini-1.5-flash-latest');
            } else {
                throw new Error(`Unsupported provider: ${info.provider}`);
            }

            const latency = Date.now() - startTime;
            await Promise.all([
                incrementUsage(info.provider),
                recordProviderHealth(serviceKey, true, latency)
            ]);

            return res;
        } catch (err: any) {
            const latency = Date.now() - startTime;
            console.warn(`[smartLLM] ⚠️ ${serviceKey} failed: ${err.message}`);
            lastError = err.message;
            await recordProviderHealth(serviceKey, false, latency);
            router.demote(serviceKey); // Tell the router to move it to the back
        }
    }

    return { output: `Global Brain reached capacity. All providers failed. Last Error: ${lastError}` };
}

async function callOpenAI(request: LLMRequest, model: string): Promise<LLMResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OpenAI Key missing");

    const messages = [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt }
    ];

    const openAiTools = request.tools ? await mcpManager.getToolsForRole(request.role || 'default') : [];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages,
            tools: openAiTools.length > 0 ? openAiTools : undefined,
            tool_choice: openAiTools.length > 0 ? 'auto' : undefined
        })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return { output: data.choices[0].message.content, toolCalls: data.choices[0].message.tool_calls?.length || 0 };
}

async function callAnthropic(request: LLMRequest, model: string): Promise<LLMResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Anthropic Key missing");

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model,
            system: request.systemPrompt,
            messages: [{ role: 'user', content: request.userPrompt }],
            max_tokens: 4000
        })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return { output: data.content[0].text };
}

async function callGemini(request: LLMRequest, model: string): Promise<LLMResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini Key missing");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: `System: ${request.systemPrompt}\n\nUser: ${request.userPrompt}` }] }]
        })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    const data = await response.json();
    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('Gemini returned empty or blocked content');
    }
    return { output: data.candidates[0].content.parts[0].text };
}

async function incrementUsage(provider: string) {
    const today = new Date().toISOString().split('T')[0];
    const { error } = await supabase.rpc('increment_usage', { p_date: today, p_provider: provider });
    if (error) console.error(`[CostGuard] ⚠️ Failed to track ${provider} usage:`, error.message);
}
