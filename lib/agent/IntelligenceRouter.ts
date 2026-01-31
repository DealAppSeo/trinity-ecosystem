
import { Task, ProviderConfig, WisdomProfile } from './types';
import { AGENT_WISDOM } from './wisdom';

export enum ProviderTier {
    ELITE = 3,    // Claude 3.5, GPT-4o, Grok-2
    BALANCED = 2, // Gemini 1.5 Pro, Llama 3.1 70B, Qwen 2.5 72B
    ECONOMY = 1   // DeepSeek V3, Llama 3.1 8B, Gemini Flash, Groq/Cerebras
}

export interface ProviderDetails {
    key: string;
    tier: ProviderTier;
    speed: number; // 0-100 (Tokens/Sec normalized)
    latency: number; // ms p99
    costPerMillion: number; // USD
    reasoning: number; // 1-10
    isFree: boolean;
    family: 'transformer' | 'moe' | 'distilled' | 'specialized' | 'diffusion';
    specialties: string[];
    isLocal?: boolean;
    quantization?: 'AWQ' | 'GGUF' | 'FP8' | 'none';
}

export const PROVIDER_REGISTRY: Record<string, ProviderDetails> = {
    'openai': { key: 'openai', tier: ProviderTier.ELITE, speed: 80, latency: 200, costPerMillion: 15.00, reasoning: 10, isFree: false, family: 'transformer', specialties: ['code', 'logic', 'json'] },
    'anthropic': { key: 'anthropic', tier: ProviderTier.ELITE, speed: 70, latency: 250, costPerMillion: 15.00, reasoning: 10, isFree: false, family: 'transformer', specialties: ['writing', 'complex-logic', 'coding'] },
    'grok': { key: 'grok', tier: ProviderTier.ELITE, speed: 100, latency: 150, costPerMillion: 5.00, reasoning: 9, isFree: false, family: 'transformer', specialties: ['real-time', 'logic', 'truth-seeking'] },
    'deepseek': { key: 'deepseek', tier: ProviderTier.ECONOMY, speed: 120, latency: 100, costPerMillion: 0.27, reasoning: 10, isFree: false, family: 'moe', specialties: ['code', 'math', 'reasoning', 'r1'] },
    'gemini': { key: 'gemini', tier: ProviderTier.BALANCED, speed: 90, latency: 180, costPerMillion: 1.25, reasoning: 8, isFree: false, family: 'transformer', specialties: ['multimodal', 'long-context'] },
    'groq': { key: 'groq', tier: ProviderTier.ECONOMY, speed: 500, latency: 10, costPerMillion: 0.14, reasoning: 6, isFree: true, family: 'distilled', specialties: ['speed', 'tool-calling', 'interactive'] },
    'fireworks': { key: 'fireworks', tier: ProviderTier.ECONOMY, speed: 150, latency: 30, costPerMillion: 0.15, reasoning: 8, isFree: false, family: 'transformer', specialties: ['speed', 'api', 'vision'] },
    'together': { key: 'together', tier: ProviderTier.ECONOMY, speed: 180, latency: 50, costPerMillion: 0.10, reasoning: 8, isFree: false, family: 'transformer', specialties: ['batch', 'speed', 'code'] },
    'local_4090': { key: 'local_4090', tier: ProviderTier.ECONOMY, speed: 60, latency: 50, costPerMillion: 0.02, reasoning: 7, isFree: true, isLocal: true, quantization: 'GGUF', family: 'transformer', specialties: ['privacy', 'edge', 'constant-flow'] },
    'cerebras': { key: 'cerebras', tier: ProviderTier.ECONOMY, speed: 450, latency: 15, costPerMillion: 0.10, reasoning: 6, isFree: true, family: 'distilled', specialties: ['ultra-fast', 'inference'] },
    'openrouter': { key: 'openrouter', tier: ProviderTier.ECONOMY, speed: 70, latency: 120, costPerMillion: 0.40, reasoning: 9, isFree: false, family: 'moe', specialties: ['diversity', 'arbitrage', 'specialized'] }
};

// [PHASE 11] INTELLIGENCE ROUTER
export class IntelligenceRouter {
    private agentName: string;
    private sessionTasksCompleted: number = 0;
    private demotedProviders: Set<string> = new Set();

    constructor(agentName: string) {
        this.agentName = agentName;
    }

    /**
     * Determines the optimal provider based on task context and diversity requirements.
     */
    route(task: Task, availableProviders: string[]): string[] {
        // [ANTIFRAGILE] Filter out demoted providers
        const activeProviders = availableProviders.filter(p => !this.demotedProviders.has(p));

        // If everything is demoted, reset the set (circuit breaker)
        if (activeProviders.length === 0 && availableProviders.length > 0) {
            console.warn(`[ROUTER] ⚠️ All providers demoted. Reseting circuit breaker.`);
            this.demotedProviders.clear();
            return availableProviders;
        }

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

        // 4. FILTER & SCORE (ANFIS Arbitrage Logic)
        const candidates = activeProviders
            .filter(p => p !== excludeProvider)
            .map(p => {
                const info = PROVIDER_REGISTRY[p] || { key: p, tier: ProviderTier.ECONOMY, speed: 50, latency: 100, costPerMillion: 0.5, reasoning: 5, family: 'transformer', specialties: [] };
                let score = 0;

                // A. Base Reasoning Score (High priority for quality)
                score += info.reasoning * 10;

                // B. Cost-per-Quality-Adjusted-Token Arbitrage
                // Lower cost + Higher reasoning = Best Value
                const costWeight = 1.0 / (info.costPerMillion + 0.01);
                score += Math.min(costWeight * 2, 50); // Cap cost bonus

                // C. Latency Awareness
                if (taskType === 'interactive' || taskType === 'chat') {
                    if (info.latency < 50) score += 40; // Speed Champions boost
                }

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

        // 5. Squad-Based Boost (Final Polish)
        const agentWisdom = AGENT_WISDOM[this.agentName];
        if (agentWisdom?.squad) {
            result.sort((a, b) => {
                const aInfo = PROVIDER_REGISTRY[a];
                const bInfo = PROVIDER_REGISTRY[b];
                const aMatch = aInfo?.specialties.some(s => agentWisdom.specialties.includes(s));
                const bMatch = bInfo?.specialties.some(s => agentWisdom.specialties.includes(s));
                if (aMatch && !bMatch) return -1;
                if (!aMatch && bMatch) return 1;
                return 0;
            });
        }

        console.log(`[ROUTER] 🚦 Selected priority: ${result.slice(0, 3).join(', ')} (Reason: ${isFirstImpression ? 'FirstImpression' : 'Standard'}, Verification: ${isVerification})`);

        return result;
    }

    /**
     * Temporarily demotes a provider (e.g. on 429 or timeout)
     */
    demote(provider: string) {
        console.warn(`[ROUTER] 📉 Demoting ${provider} due to failure/quota.`);
        this.demotedProviders.add(provider);
        // Auto-recovery after 5 minutes
        setTimeout(() => {
            if (this.demotedProviders.has(provider)) {
                console.log(`[ROUTER] 📈 Restoring ${provider} to active rotation.`);
                this.demotedProviders.delete(provider);
            }
        }, 300000);
    }

    /**
     * Scans task for keywords and complexity to route to best-fit models.
     */
    detectSpecializedRequest(task: Task): string | null {
        const text = `${task.title} ${task.description}`.toLowerCase();
        const wordCount = text.split(/\s+/).length;

        // 1. HEURISTIC: Simple Factual Lookup (< 20 words, no complex reasoning)
        const isSimple = wordCount < 20 && !text.match(/design|implement|complex|analyze|architect|reason/i);
        if (isSimple) {
            console.log(`[ROUTER] ⚡ Heuristic: Simple Lookup detected. Preferring Phi-3.5/Gemma-2b.`);
            return 'phi-3.5-mini';
        }

        // 2. HEURISTIC: Complex Reasoning (Large prompts or code)
        const isComplex = wordCount > 200 || text.match(/math|code|algorithm|logic|reasoning|architect/i);
        if (isComplex) {
            console.log(`[ROUTER] 🧠 Heuristic: Complex Reasoning detected. Preferring Mistral Small 3 / Qwen 2.5 14B.`);
            return 'mistral-small-3';
        }

        // 3. SPECIALIZED KEYWORDS
        const specialties = ['qwen', 'mistral', 'llama', 'gemma', 'cohere', 'stable-diffusion', 'rasa', 'ollama', 'deepseek', 'phi'];
        for (const s of specialties) {
            if (text.includes(s)) return this.getSpecializedModel(s);
        }
        return null;
    }

    /**
     * Maps specialized requests to known models with quantization awareness.
     */
    getSpecializedModel(request: string): string | null {
        const map: Record<string, string> = {
            'phi': 'microsoft/phi-3.5-mini-128k-instruct',
            'qwen': 'qwen/qwen-2.5-coder-32b-instruct',
            'deepseek': 'deepseek/deepseek-r1',
            'mistral': 'mistralai/mistral-small-24b-3-instruct',
            'llama': 'meta-llama/llama-3.3-70b-instruct',
            'gemma': 'google/gemma-2-27b-it',
            'cohere': 'cohere/command-r-plus-08-2024',
            'stable-diffusion': 'diffusion-tool'
        };
        return map[request.toLowerCase()] || null;
    }

    /**
     * [PHASE 11] LATENCY & ARBITRAGE
     * Final re-prioritization based on quantization health and budget.
     */
    applyLatencyLogic(candidates: any[], currentLatency: number): any[] {
        // Boost Local RTX 4090 if latency is high (Arbitrage win)
        if (currentLatency > 2000) {
            console.log(`[ROUTER] ⏳ System Latency High (${currentLatency}ms). Shifting to Local/Quantized arbitrage.`);
            return candidates.sort((a, b) => {
                const aInfo = PROVIDER_REGISTRY[a.key];
                const bInfo = PROVIDER_REGISTRY[b.key];
                if (aInfo?.isLocal && !bInfo?.isLocal) return -1;
                if (aInfo?.isFree && !bInfo?.isFree) return -1;
                return 0;
            });
        }

        // Quantization Awareness: Prefer AWQ/FP8 on GPU, GGUF on CPU
        // (Simplified for this registry)
        return candidates.sort((a, b) => {
            const aInfo = PROVIDER_REGISTRY[a.key];
            const bInfo = PROVIDER_REGISTRY[b.key];
            if (aInfo?.quantization === 'AWQ' && bInfo?.quantization !== 'AWQ') return -1;
            return 0;
        });
    }
}
