
import { Task, ProviderConfig, WisdomProfile } from './types';
import { AGENT_WISDOM } from './wisdom';
import { UnifiedServiceRegistry, ServiceDefinition, ServiceTier } from './UnifiedServiceRegistry';

export interface RoutingWeights {
    speed: number;   // 0-100
    quality: number; // 0-100
    cost: number;    // 0-100
}

export class IntelligenceRouter {
    private agentName: string;
    private sessionTasksCompleted: number = 0;
    private demotedProviders: Set<string> = new Set();
    private registry: UnifiedServiceRegistry;
    private weights: RoutingWeights = { speed: 50, quality: 50, cost: 50 };

    constructor(agentName: string, weights?: RoutingWeights) {
        this.agentName = agentName;
        this.registry = UnifiedServiceRegistry.getInstance();
        if (weights) this.weights = weights;
    }

    /**
     * Determines the optimal provider based on task context and diversity requirements.
     */
    async route(task: Task, availableProviders: string[]): Promise<string[]> {
        // [ANTIFRAGILE] Filter out demoted providers
        const activeProviders = availableProviders.filter(p => !this.demotedProviders.has(p));

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

        // 2. ADAPTIVE FACTORS
        const userTier = (task as any).user_tier || 'free';
        const userRep = (task as any).user_reputation || 50;
        const isFirstImpression = this.sessionTasksCompleted < 10 && userTier === 'free';
        const isFounder = userTier === 'founder' || userTier === 'admin';
        const isTopRep = userRep > 97; // Top 3% RepID boost

        // 3. SPECIALIZED MODEL DETECTION (Keyword Overrides)
        const forcedModel = this.detectSpecializedRequest(task);
        if (forcedModel) {
            console.log(`[ROUTER] 🎯 Special Request Detected: ${forcedModel}.`);
            return [forcedModel];
        }

        // Sync registry
        await this.registry.sync();

        // 4. FILTER & SCORE (ANFIS 2.0 Arbitrage)
        const candidates = await Promise.all(activeProviders
            .filter(p => p !== excludeProvider)
            .map(async (p) => {
                const info = this.registry.getServiceByKey(p);
                if (!info) return { key: p, score: -1000 };

                let score = 0;

                // A. Base Reasoning Score (QUALITY WEIGHT)
                const qualityBonus = (info.tier === ServiceTier.ELITE ? 100 : info.tier === ServiceTier.BALANCED ? 50 : 10);
                score += qualityBonus * (this.weights.quality / 50);

                // B. Latency Awareness (SPEED WEIGHT)
                if (taskType === 'interactive' || taskType === 'chat' || this.weights.speed > 70) {
                    const speedFactor = Math.max(0.1, (1000 - info.latency_ms_avg) / 1000);
                    score += (speedFactor * 100) * (this.weights.speed / 50);
                }

                // C. Cost Awareness (COST WEIGHT - Inverse relationship)
                // Lower cost is better when cost weight is high
                const costScore = info.cost_per_token ? (1 / (info.cost_per_token * 1000000)) : 10;
                score += costScore * (this.weights.cost / 50);

                // D. ADAPTIVE LOGIC
                // [FOUNDER/TOP-REP BOOST] - Access Elite by default
                if (isFounder || isTopRep) {
                    if (info.tier === ServiceTier.ELITE) score += 200;
                }
                // [FIRST IMPRESSION BOOST] - New users get better results initially
                else if (isFirstImpression) {
                    if (info.tier === ServiceTier.ELITE) score += 150;
                }
                // [ECONOMY THROTTLE] - Long sessions for free accounts get throttled to economy
                else if (userTier === 'free' && this.sessionTasksCompleted > 20) {
                    if (info.tier === ServiceTier.ECONOMY) score += 100;
                    else score -= 50;
                }

                // D. SPECIALTY MATCH
                if (info.specialties.includes(taskType)) score += 40;

                // E. VERIFICATION DIVERSITY
                if (isVerification && excludeProvider) {
                    const executorInfo = this.registry.getServiceByKey(excludeProvider);
                    if (executorInfo && executorInfo.provider !== info.provider) {
                        score += 30; // Diversity bonus
                    }
                }

                return { key: p, score };
            }));

        const sorted = candidates.sort((a, b) => b.score - a.score);
        const result = sorted.map(c => c.key);

        if (result.length === 0 && availableProviders.length > 0) {
            result.push(...availableProviders);
        }

        this.sessionTasksCompleted++;

        // Squad-Based Boost
        const agentWisdom = AGENT_WISDOM[this.agentName];
        if (agentWisdom?.squad) {
            result.sort((a, b) => {
                const aInfo = this.registry.getServiceByKey(a);
                const bInfo = this.registry.getServiceByKey(b);
                const aMatch = aInfo?.specialties.some(s => agentWisdom.specialties.includes(s));
                const bMatch = bInfo?.specialties.some(s => agentWisdom.specialties.includes(s));
                if (aMatch && !bMatch) return -1;
                if (!aMatch && bMatch) return 1;
                return 0;
            });
        }

        return result;
    }

    public suggestTools(task: Task): string[] {
        const text = `${task.title} ${task.description}`.toLowerCase();
        const suggestions: string[] = [];

        if (text.match(/design|figma|ui|ux|mockup/i)) suggestions.push('Figma');
        if (text.match(/image|generate|art|draw|creative|flux|sdxl|sd3/i)) suggestions.push('CreativeSuite (Flux.1, SD3)');
        if (text.match(/cache|persist|redis|state|blackboard/i)) suggestions.push('Redis (Upstash)');
        if (text.match(/automation|workflow|n8n|make/i)) suggestions.push('Automation (n8n, Make)');
        if (text.match(/notion|doc|wiki/i)) suggestions.push('Notion');
        if (text.match(/search|lookup|research|latest|current/i)) suggestions.push('TavilySearch', 'Perplexity');
        if (text.match(/code|github|pr|repo|git/i)) suggestions.push('GitHub', 'Sandbox');

        return suggestions;
    }

    demote(provider: string) {
        console.warn(`[ROUTER] 📉 Demoting ${provider} due to failure/quota.`);
        this.demotedProviders.add(provider);
        setTimeout(() => this.demotedProviders.delete(provider), 300000);
    }

    detectSpecializedRequest(task: Task): string | null {
        const text = `${task.title} ${task.description}`.toLowerCase();

        // Extended specialized detection
        if (text.includes('flux')) return 'flux-1-dev';
        if (text.includes('sd3')) return 'sd3';
        if (text.includes('whisper')) return 'whisper-large-v3';
        if (text.includes('qwen')) return 'qwen-2.5-coder-32b';
        if (text.includes('deepseek')) return 'deepseek-r1';
        if (text.includes('kimi')) return 'kimi-k2.3';
        if (text.includes('mammoth')) return 'mammoth-ai';
        if (text.includes('gemini')) return 'gemini-1.5-pro';

        return null;
    }
}
