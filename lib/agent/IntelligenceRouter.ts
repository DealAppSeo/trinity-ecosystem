
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
    family: 'transformer' | 'moe' | 'distilled' | 'specialized' | 'diffusion' | 'aggregator';
    specialties: string[];
    isLocal?: boolean;
    quantization?: 'AWQ' | 'GGUF' | 'FP8' | 'none';
    supportsTools: boolean;
    reputation?: number; // 0-100 (Provider RepID)
}

export const PROVIDER_REGISTRY: Record<string, ProviderDetails> = {
    'openai': { key: 'openai', tier: ProviderTier.ELITE, speed: 80, latency: 200, costPerMillion: 15.00, reasoning: 10, isFree: false, family: 'transformer', specialties: ['code', 'logic', 'json'], supportsTools: true, reputation: 95 },
    'anthropic': { key: 'anthropic', tier: ProviderTier.ELITE, speed: 70, latency: 250, costPerMillion: 15.00, reasoning: 10, isFree: false, family: 'transformer', specialties: ['writing', 'complex-logic', 'coding'], supportsTools: true, reputation: 98 },
    'grok': { key: 'grok', tier: ProviderTier.ELITE, speed: 100, latency: 150, costPerMillion: 5.00, reasoning: 9, isFree: false, family: 'transformer', specialties: ['real-time', 'logic', 'truth-seeking'], supportsTools: true, reputation: 90 },
    'deepseek': { key: 'deepseek', tier: ProviderTier.ECONOMY, speed: 120, latency: 100, costPerMillion: 0.27, reasoning: 10, isFree: false, family: 'moe', specialties: ['code', 'math', 'reasoning', 'r1'], supportsTools: true, reputation: 96 },
    'gemini': { key: 'gemini', tier: ProviderTier.BALANCED, speed: 90, latency: 180, costPerMillion: 1.25, reasoning: 8, isFree: false, family: 'transformer', specialties: ['multimodal', 'long-context'], supportsTools: true, reputation: 88 },
    'groq': { key: 'groq', tier: ProviderTier.ECONOMY, speed: 500, latency: 10, costPerMillion: 0.14, reasoning: 6, isFree: true, family: 'distilled', specialties: ['speed', 'tool-calling', 'interactive'], supportsTools: true, reputation: 92 },
    'fireworks': { key: 'fireworks', tier: ProviderTier.ECONOMY, speed: 150, latency: 30, costPerMillion: 0.15, reasoning: 8, isFree: false, family: 'transformer', specialties: ['speed', 'api', 'vision'], supportsTools: true, reputation: 85 },
    'together': { key: 'together', tier: ProviderTier.ECONOMY, speed: 180, latency: 50, costPerMillion: 0.10, reasoning: 8, isFree: false, family: 'transformer', specialties: ['batch', 'speed', 'code'], supportsTools: true, reputation: 85 },
    'local_4090': { key: 'local_4090', tier: ProviderTier.ECONOMY, speed: 60, latency: 50, costPerMillion: 0.02, reasoning: 7, isFree: true, isLocal: true, quantization: 'GGUF', family: 'transformer', specialties: ['privacy', 'edge', 'constant-flow'], supportsTools: false, reputation: 99 },
    'cerebras': { key: 'cerebras', tier: ProviderTier.ECONOMY, speed: 450, latency: 15, costPerMillion: 0.10, reasoning: 6, isFree: true, family: 'distilled', specialties: ['ultra-fast', 'inference'], supportsTools: true, reputation: 90 },
    'openrouter': { key: 'openrouter', tier: ProviderTier.ECONOMY, speed: 70, latency: 120, costPerMillion: 0.40, reasoning: 9, isFree: false, family: 'aggregator', specialties: ['diversity', 'arbitrage', 'specialized'], supportsTools: true, reputation: 94 },
    'asi1': { key: 'asi1', tier: ProviderTier.ELITE, speed: 85, latency: 180, costPerMillion: 10.00, reasoning: 10, isFree: false, family: 'aggregator', specialties: ['social-intelligence', 'chaos', 'multi-step'], supportsTools: true, reputation: 95 },
    'perplexity': { key: 'perplexity', tier: ProviderTier.ECONOMY, speed: 50, latency: 150, costPerMillion: 5.00, reasoning: 7, isFree: false, family: 'transformer', specialties: ['real-time', 'search'], supportsTools: false, reputation: 80 }
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
                const info = PROVIDER_REGISTRY[p] || { key: p, tier: ProviderTier.ECONOMY, speed: 50, latency: 100, costPerMillion: 0.5, reasoning: 5, family: 'transformer', specialties: [], supportsTools: true, reputation: 50 };
                let score = 0;

                // A. Base Reasoning Score (Weighted by Provider RepID)
                const repWeight = (info.reputation || 50) / 100;
                score += info.reasoning * 10 * repWeight;

                // B. Cost-per-Quality-Adjusted-Token Arbitrage
                const costWeight = 1.0 / (info.costPerMillion + 0.01);
                score += Math.min(costWeight * 2, 50);

                // [ANTIGRAVITY] Tier-0 Arbitration (Free Tier Boost)
                if (info.isFree && !isFirstImpression) {
                    score += 150; // Massively boost free tiers for ongoing work
                }

                // C. Latency Awareness
                if (taskType === 'interactive' || taskType === 'chat') {
                    if (info.latency < 50) score += 40;
                }

                // Tier Weighting
                if (isFirstImpression) {
                    if (info.tier === ProviderTier.ELITE) score += 50;
                } else {
                    if (info.tier === ProviderTier.ECONOMY) score += 20;
                }

                // Specialty Match
                if (info.specialties.includes(taskType)) score += 30;

                // [ANTIGRAVITY] Aggregator Governance
                if (info.family === 'aggregator') {
                    // Aggregators (ASI1, OpenRouter) are used as fallback or for "Diversity"
                    score -= 50;
                    if (taskType === 'social-intelligence') score += 200; // ASI1 Specialty
                }

                // Verification Diversity
                if (isVerification && excludeProvider) {
                    const executorInfo = PROVIDER_REGISTRY[excludeProvider];
                    if (executorInfo && (executorInfo.family !== info.family || executorInfo.key !== info.key)) {
                        const diversityBonus = 40 * ((task as any).user_reputation || 50) / 50;
                        score += diversityBonus;
                    }
                }

                return { key: p, score };
            })
            .sort((a, b) => b.score - a.score);

        const result = candidates.map(c => c.key);

        if (result.length === 0 && availableProviders.length > 0) {
            result.push(...availableProviders);
        }

        this.sessionTasksCompleted++;

        // 5. Squad-Based Boost
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

        const toolSuggestions = this.suggestTools(task);
        console.log(`[ROUTER] 🚦 Selected priority: ${result.slice(0, 3).join(', ')} | Tools: ${toolSuggestions.join(', ')}`);
        return result;
    }

    /**
     * Suggests specific MCP tools based on task keywords.
     */
    public suggestTools(task: Task): string[] {
        const text = `${task.title} ${task.description}`.toLowerCase();
        const suggestions: string[] = [];

        if (text.match(/design|figma|ui|ux|mockup/i)) suggestions.push('Figma');
        if (text.match(/image|generate|art|draw|creative/i)) suggestions.push('CreativeSuite (generate_image)');
        if (text.match(/cache|persist|redis|state|blackboard/i)) suggestions.push('Redis');
        if (text.match(/huggingface|hf|inference|specialized-model/i)) suggestions.push('HuggingFace');
        if (text.match(/search|lookup|research|latest|current/i)) suggestions.push('TavilySearch', 'YouDotCom', 'Cohere');
        if (text.match(/academic|paper|arxiv|scholar|peer-review|technical-doc/i)) suggestions.push('ResearchSuite');
        if (text.match(/video|audio|music|voice|multimodal| specialized-ai|replicate/i)) suggestions.push('Replicate');
        if (text.match(/stock|market|ticker|fundamental|balance-sheet|income-statement|cash-flow/i)) suggestions.push('AlphaVantage');
        if (text.match(/code|github|pr|repo|git/i)) suggestions.push('GitHub', 'FileSystem', 'Sandbox');
        if (text.match(/automation|workflow|n8n|flowise/i)) suggestions.push('Automation', 'Stitch');
        if (text.match(/browser|scrape|crawl|playwright|puppeteer/i)) suggestions.push('PlaywrightExpert', 'Puppeteer', 'YouDotCom');
        if (text.match(/spreadsheet|excel|google|docs|sheet|performa|business-plan/i)) suggestions.push('GoogleWorkspace', 'Supabase');
        if (text.match(/database|table|rls|supabase|storage/i)) suggestions.push('Supabase', 'FileSystem', 'DataMCP');
        if (text.match(/infra|server|railway|restart|restart|stalled/i)) suggestions.push('Railway', 'GitHub', 'FileSystem');

        return suggestions;
    }

    demote(provider: string) {
        console.warn(`[ROUTER] 📉 Demoting ${provider} due to failure/quota.`);
        this.demotedProviders.add(provider);
        setTimeout(() => {
            if (this.demotedProviders.has(provider)) {
                console.log(`[ROUTER] 📈 Restoring ${provider} to active rotation.`);
                this.demotedProviders.delete(provider);
            }
        }, 300000);
    }

    detectSpecializedRequest(task: Task): string | null {
        const text = `${task.title} ${task.description}`.toLowerCase();
        const wordCount = text.split(/\s+/).length;

        const isSimple = wordCount < 20 && !text.match(/design|implement|complex|analyze|architect|reason/i);
        if (isSimple) return 'google/gemma-2-9b-it';

        const isComplex = wordCount > 200 || text.match(/math|code|algorithm|logic|reasoning|architect/i);
        if (isComplex) return 'mistralai/mistral-small-24b-3-instruct';

        const specialties = ['qwen', 'mistral', 'llama', 'gemma', 'cohere', 'stable-diffusion', 'rasa', 'ollama', 'deepseek', 'phi', 'r1'];
        for (const s of specialties) {
            if (text.includes(s)) return this.getSpecializedModel(s);
        }
        return null;
    }

    getSpecializedModel(request: string): string | null {
        const map: Record<string, string> = {
            'phi': 'microsoft/phi-3.5-mini-128k-instruct',
            'qwen': 'qwen/qwen-2.5-coder-32b-instruct',
            'deepseek': 'deepseek/deepseek-chat',
            'r1': 'deepseek/deepseek-r1',
            'mistral': 'mistralai/mistral-small-24b-3-instruct',
            'llama': 'meta-llama/llama-3.3-70b-instruct',
            'gemma': 'google/gemma-2-9b-it',
            'cohere': 'cohere/command-r-plus-08-2024',
            'stable-diffusion': 'diffusion-tool'
        };
        return map[request.toLowerCase()] || null;
    }

    applyLatencyLogic(candidates: any[], currentLatency: number): any[] {
        if (currentLatency > 2000) {
            return candidates.sort((a, b) => {
                const aInfo = PROVIDER_REGISTRY[a.key];
                const bInfo = PROVIDER_REGISTRY[b.key];
                if (aInfo?.isLocal && !bInfo?.isLocal) return -1;
                if (aInfo?.isFree && !bInfo?.isFree) return -1;
                return 0;
            });
        }
        return candidates.sort((a, b) => {
            const aInfo = PROVIDER_REGISTRY[a.key];
            const bInfo = PROVIDER_REGISTRY[b.key];
            if (aInfo?.quantization === 'AWQ' && bInfo?.quantization !== 'AWQ') return -1;
            return 0;
        });
    }

    isModelToolCompatible(model: string): boolean {
        const incompatibleModels = [
            'google/gemma-2-9b-it',
            'google/gemma-2-27b-it',
            'perplexity/sonar',
            'sonar'
        ];
        return !incompatibleModels.some(m => model.includes(m));
    }

    getEscalationModel(task: Task): string {
        const text = `${task.title} ${task.description}`.toLowerCase();

        // Deep Reasoning / Alpha-tier models for escalation
        if (text.match(/code|algorithm|script|implementation/i)) {
            return 'qwen/qwen-2.5-coder-32b-instruct';
        }
        if (text.match(/math|logic|complex|analyze/i)) {
            return 'deepseek/deepseek-r1'; // The new standard for reasoning
        }
        if (text.match(/creative|branding|writing|copy/i)) {
            return 'anthropic/claude-3-5-sonnet';
        }

        // Default high-tier catch-all
        return 'meta-llama/llama-3.3-70b-instruct';
    }
}
