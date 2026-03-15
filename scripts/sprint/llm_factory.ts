import { ChatGroq } from '@langchain/groq';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

export function getLLM(provider: string, temperature = 0.2) {
    provider = provider.toLowerCase();
    
    if (provider === 'anthropic' || provider === 'claude') {
        return new ChatAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY, modelName: "claude-3-5-sonnet-20241022", temperature });
    }
    if (provider === 'openai' || provider === 'gpt-4o') {
        return new ChatOpenAI({ apiKey: process.env.OPENAI_API_KEY, modelName: "gpt-4o", temperature });
    }
    if (provider === 'google' || provider === 'gemini') {
        // Assume user's new Google AI Ultra subscription
        return new ChatGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY, modelName: "gemini-1.5-pro", temperature });
    }
    if (provider === 'groq') {
        return new ChatGroq({ apiKey: process.env.GROQ_API_KEY, modelName: "llama-3.3-70b-versatile", temperature });
    }
    if (provider === 'cerebras') {
        return new ChatOpenAI({ apiKey: process.env.CEREBRAS_API_KEY, configuration: { baseURL: "https://api.cerebras.ai/v1" }, modelName: "llama3.1-8b", temperature });
    }
    if (provider === 'deepseek') {
        return new ChatOpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, configuration: { baseURL: "https://api.deepseek.com" }, modelName: "deepseek-chat", temperature });
    }
    if (provider === 'samba' || provider === 'sambanova') {
        return new ChatOpenAI({ apiKey: process.env.SAMBANOVA_API_KEY, configuration: { baseURL: "https://api.sambanova.ai/v1" }, modelName: "Meta-Llama-3.1-8B-Instruct", temperature });
    }
    if (provider === 'together') {
        return new ChatOpenAI({ apiKey: process.env.TOGETHER_API_KEY, configuration: { baseURL: "https://api.together.xyz/v1" }, modelName: "meta-llama/Llama-3-8b-chat-hf", temperature });
    }
    if (provider === 'openrouter') {
        return new ChatOpenAI({ apiKey: process.env.OPENROUTER_API_KEY, configuration: { baseURL: "https://openrouter.ai/api/v1" }, modelName: "openrouter/auto", temperature });
    }
    if (provider === 'perplexity') {
        return new ChatOpenAI({ apiKey: process.env.PERPLEXITY_API_KEY, configuration: { baseURL: "https://api.perplexity.ai" }, modelName: "llama-3-sonar-large-32k-online", temperature });
    }
    if (provider === 'you') {
        return new ChatOpenAI({ apiKey: process.env.OPENROUTER_API_KEY, configuration: { baseURL: "https://openrouter.ai/api/v1" }, modelName: "you/you-model", temperature });
    }
    if (provider === 'portkey') {
        return new ChatOpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            configuration: {
                baseURL: "https://api.portkey.ai/v1",
                defaultHeaders: {
                    'x-portkey-api-key': process.env.PORTKEY_API_KEY,
                    'x-portkey-provider': 'openai'
                }
            },
            modelName: "gpt-4o",
            temperature
        });
    }

    console.warn(`[FACTORY] Provider '${provider}' not found or unsupported. Falling back to Groq.`);
    return new ChatGroq({ apiKey: process.env.GROQ_API_KEY, modelName: "llama3-8b-8192", temperature });
}
