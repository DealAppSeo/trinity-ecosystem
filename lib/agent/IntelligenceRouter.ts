
import { Task, ProviderConfig, WisdomProfile } from './types';

export enum ProviderTier {
    ELITE = 3,    // Claude 3.5, GPT-4o, Grok-2
    BALANCED = 2, // Gemini 1.5 Pro, Llama 3.1 70B, Qwen 2.5 72B
    ECONOMY = 1   // DeepSeek V3, Llama 3.1 8B, Gemini Flash, Groq/Cerebras
}

export interface ProviderDetails {
    key: string;
    tier: ProviderTier;
    speed: number; // 1-10
    reasoning: number; // 1-10
    isFree: boolean;
    family: 'transformer' | 'moe' | 'distilled' | 'specialized' | 'diffusion';
    specialties: string[];
}

export const PROVIDER_REGISTRY: Record<string, ProviderDetails> = {
    'openai': { key: 'openai', tier: ProviderTier.ELITE, speed: 7, reasoning: 10, isFree: false, family: 'transformer', specialties: ['code', 'logic', 'json'] },
    'anthropic': { key: 'anthropic', tier: ProviderTier.ELITE, speed: 6, reasoning: 10, isFree: false, family: 'transformer', specialties: ['writing', 'complex-logic', 'coding'] },
    'grok': { key: 'grok', tier: ProviderTier.ELITE, speed: 8, reasoning: 9, isFree: false, family: 'transformer', specialties: ['real-time', 'logic', 'truth-seeking'] },
    'deepseek': { key: 'deepseek', tier: ProviderTier.ECONOMY, speed: 9, reasoning: 9, isFree: false, family: 'moe', specialties: ['code', 'math', 'cost-efficiency'] },
    'gemini': { key: 'gemini', tier: ProviderTier.BALANCED, speed: 8, reasoning: 8, isFree: false, family: 'transformer', specialties: ['multimodal', 'long-context'] },
    'groq': { key: 'groq', tier: ProviderTier.ECONOMY, speed: 10, reasoning: 6, isFree: true, family: 'distilled', specialties: ['speed', 'tool-calling'] },
    'cerebras': { key: 'cerebras', tier: ProviderTier.ECONOMY, speed: 10, reasoning: 6, isFree: true, family: 'distilled', specialties: ['ultra-fast', 'inference'] },
    'perplexity': { key: 'perplexity', tier: ProviderTier.BALANCED, speed: 7, reasoning: 8, isFree: false, family: 'specialized', specialties: ['research', 'web-search'] },
    'openrouter': { key: 'openrouter', tier: ProviderTier.ECONOMY, speed: 7, reasoning: 8, isFree: false, family: 'moe', specialties: ['diversity', 'arbitrage'] }
};

// [PHASE 11] INTELLIGENCE ROUTER
export class IntelligenceRouter {
    private agentName: string;
    private sessionTasksCompleted: number = 0;

    constructor(agentName: string) {
        this.agentName = agentName;
    }

    /**
     * Determines the optimal provider based on task context and diversity requirements.
     */
    route(task: Task, availableProviders: string[]): string[] {
        const isVerification = task.title.includes('[REVIEW]') || task.status === 'done';
        const taskType = task.task_type || 'general';

        // 1. DIVERSITY OF THOUGHT: Executor != Verifier
        let excludeProvider: string | null = null;
        try {
            const meta = typeof task.metadata === 'string' ? JSON.parse(task.metadata) : task.metadata;
            excludeProvider = meta?.provider_used || meta?.creator_provider || null;
        } catch (e) { }

        // 2. FIRST IMPRESSION STRATEGY
        // If the user is new (low reputation/first interaction), favor ELITE for "Best First Impression"
        // We also use ELITE for the very first task of the agent's process session.
        const isFirstImpression = this.sessionTasksCompleted === 0 || (task as any).user_reputation < 60;

        // 3. SPECIALIZED MODEL DETECTION
        const forcedModel = this.detectSpecializedRequest(task);
        if (forcedModel && availableProviders.includes('openrouter')) {
            console.log(`[ROUTER] 🎯 Special Request Detected: ${forcedModel}. Routing to OpenRouter.`);
            return ['openrouter'];
        }

        // 4. FILTER & SCORE
        const candidates = availableProviders
            .filter(p => p !== excludeProvider)
            .map(p => {
                const info = PROVIDER_REGISTRY[p] || { key: p, tier: ProviderTier.ECONOMY, speed: 5, reasoning: 5, family: 'transformer', specialties: [] };
                let score = 0;

                // Tier Weighting
                if (isFirstImpression) {
                    if (info.tier === ProviderTier.ELITE) score += 50;
                } else {
                    // Bias towards economy for standard work
                    if (info.tier === ProviderTier.ECONOMY) score += 20;
                }

                // Specialty Match
                if (info.specialties.includes(taskType)) score += 30;

                // Verification Diversity: Prefer diverse model architectures for validation
                // This is a "weighted influence" — not a rigid rule.
                if (isVerification && excludeProvider) {
                    const executorInfo = PROVIDER_REGISTRY[excludeProvider];
                    if (executorInfo && executorInfo.family !== info.family) {
                        // Dynamic bonus based on reputation — higher reputation agents seek deeper diversity
                        const diversityBonus = 40 * ((task as any).user_reputation || 50) / 50;
                        score += diversityBonus;
                    }
                }

                return { key: p, score };
            })
            .sort((a, b) => b.score - a.score);

        const result = candidates.map(c => c.key);

        // Fallback: If we excluded everything, add back the original provider as a last resort
        if (result.length === 0 && availableProviders.length > 0) {
            result.push(...availableProviders);
        }

        this.sessionTasksCompleted++;
        console.log(`[ROUTER] 🚦 Selected priority: ${result.slice(0, 3).join(', ')} (Reason: ${isFirstImpression ? 'FirstImpression' : 'Standard'}, Verification: ${isVerification})`);

        return result;
    }

    /**
     * Scans task for keywords requesting specialized models.
     */
    detectSpecializedRequest(task: Task): string | null {
        const text = `${task.title} ${task.description}`.toLowerCase();
        const specialties = ['qwen', 'mistral', 'llama', 'gemma', 'cohere', 'stable-diffusion', 'rasa', 'ollama'];

        for (const s of specialties) {
            if (text.includes(s)) return this.getSpecializedModel(s);
        }
        return null;
    }

    /**
     * Maps specialized requests to known models.
     */
    getSpecializedModel(request: string): string | null {
        const map: Record<string, string> = {
            'qwen': 'qwen/qwen-2.5-72b-instruct',
            'mistral': 'mistralai/mistral-large',
            'llama': 'meta-llama/llama-3.1-405b',
            'gemma': 'google/gemma-2-27b-it',
            'cohere': 'cohere/command-r-plus',
            'stable-diffusion': 'diffusion-tool',
            'rasa': 'rasa-mcp',
            'ollama': process.env.OLLAMA_MODEL || 'llama3.1', // Local Ollama
            'gpt4all': 'gpt4all-model' // Local GPT4ALL placeholder
        };
        return map[request.toLowerCase()] || null;
    }

    /**
     * [PHASE 11] LATENCY AS OPPORTUNITY
     * Adjusts priority if system latency is high, leaning into interactive/bilateral learning.
     */
    applyLatencyLogic(candidates: any[], currentLatency: number): any[] {
        if (currentLatency > 3000) {
            console.log(`[ROUTER] ⏳ High Latency (${currentLatency}ms). Switching to Opportunity Logic (Free/Interactive).`);
            // Reverse sort or boost ECONOMY to allow for bilateral learning opportunities
            return candidates.sort((a, b) => {
                const aInfo = PROVIDER_REGISTRY[a.key];
                const bInfo = PROVIDER_REGISTRY[b.key];
                if (aInfo?.isFree && !bInfo?.isFree) return -1;
                return 0;
            });
        }
        return candidates;
    }
}
