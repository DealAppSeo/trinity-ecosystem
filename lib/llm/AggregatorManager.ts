import { LLMRequest, LLMResult } from '../llm';

export interface AggregatorConfig {
    key: string;
    baseUrl: string;
    apiKey: string;
    models: string[];
}

export class AggregatorManager {
    private static instance: AggregatorManager;
    private providers: Map<string, string> = new Map(); // provider_name -> api_key

    private constructor() {
        this.providers.set('openrouter', process.env.OPENROUTER_API_KEY || '');
        this.providers.set('siliconflow', process.env.SILICONFLOW_API_KEY || '');
        this.providers.set('deepinfra', process.env.DEEPINFRA_API_KEY || '');
        this.providers.set('portkey', process.env.PORTKEY_API_KEY || '');
    }

    public static getInstance(): AggregatorManager {
        if (!AggregatorManager.instance) {
            AggregatorManager.instance = new AggregatorManager();
        }
        return AggregatorManager.instance;
    }

    /**
     * Routes a request to an aggregator based on the provider name.
     */
    public async call(provider: string, modelId: string, request: LLMRequest): Promise<LLMResult> {
        const apiKey = this.providers.get(provider);
        if (!apiKey) throw new Error(`API Key for ${provider} missing in AggregatorManager.`);

        const baseUrl = this.getEndpoint(provider);

        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://trinity-symphony.ai', // Required by OpenRouter
                'X-Title': 'Trinity Swarm Controller'
            },
            body: JSON.stringify({
                model: modelId,
                messages: [
                    { role: 'system', content: request.systemPrompt },
                    { role: 'user', content: request.userPrompt }
                ],
                max_tokens: 4000
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Aggregator ${provider} failed (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        return {
            output: data.choices[0].message.content,
            toolCalls: data.choices[0].message.tool_calls?.length || 0
        };
    }

    private getEndpoint(provider: string): string {
        switch (provider) {
            case 'openrouter': return 'https://openrouter.ai/api/v1/chat/completions';
            case 'siliconflow': return 'https://api.siliconflow.cn/v1/chat/completions';
            case 'deepinfra': return 'https://api.deepinfra.com/v1/openai/chat/completions';
            default: return 'https://api.openai.com/v1/chat/completions'; // Proxy-compatible
        }
    }

    public isSupported(provider: string): boolean {
        return this.providers.has(provider) && !!this.providers.get(provider);
    }
}
