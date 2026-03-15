import { Task, ProviderConfig, WisdomProfile } from './types';
import { OpenAIEmbeddings } from "@langchain/openai";
import { AGENT_WISDOM } from './wisdom';
import { UnifiedServiceRegistry, ServiceDefinition, ServiceTier } from './UnifiedServiceRegistry';
import { RedisAdapter } from './RedisAdapter';
import { BFTModel } from './BFTModel';
import { MerkleDAG } from './MerkleDAG';

export interface RoutingWeights {
    speed: number;   // 0-100
    quality: number; // 0-100
    cost: number;    // 0-100
}

import { TIMLAllocation } from './TIMLManager';

export class IntelligenceRouter {
    private agentName: string;
    private sessionTasksCompleted: number = 0;
    private demotedProviders: Set<string> = new Set();
    private registry: UnifiedServiceRegistry;
    private redis: RedisAdapter;
    private weights: RoutingWeights = { speed: 50, quality: 50, cost: 50 };
    private GLOBAL_DAILY_BUDGET = parseFloat(process.env.GLOBAL_DAILY_BUDGET || '5.0');
    private dag: MerkleDAG = new MerkleDAG();

    constructor(agentName: string, weights?: RoutingWeights) {
        this.agentName = agentName;
        this.registry = UnifiedServiceRegistry.getInstance();
        this.redis = RedisAdapter.getInstance();
        if (weights) this.weights = weights;
    }

    /**
     * Determines the optimal provider(s) based on task context, risk, and diversity requirements.
     */
    async route(task: Task, availableProviders: string[], timlAllocation?: TIMLAllocation): Promise<string[]> {
        // [PHASE 13] Determine Risk Level for 3-Ply BFT
        const riskScore = this.calculateRiskScore(task);
        const requirements = BFTModel.getRequiredPlys(riskScore);

        console.log(`[ROUTER] 🛡️ Risk Score: ${riskScore.toFixed(2)}. Req: ${requirements.executors} Exec, ${requirements.verifiers} Ver.`);

        // [ANTIFRAGILE] Filter out demoted providers
        const activeProviders = availableProviders.filter(p => !this.demotedProviders.has(p));

        if (activeProviders.length === 0 && availableProviders.length > 0) {
            console.warn(`[ROUTER] ⚠️ All providers demoted. Reseting circuit breaker.`);
            this.demotedProviders.clear();
            return availableProviders;
        }

        const isVerification = task.title.includes('[REVIEW]') || task.status === 'done';
        const taskType = task.task_type || 'general';

        // [WISDOM ENGINE] Tiered Council Routing (v8.2)
        const wisdomModels: Record<string, string> = {
            'NEXUS': 'groq-llama-3-3',
            'VERITAS': 'anthropic-claude-3-5',
            'HDM': 'openai-gpt-4o',
            'SOPHIA': 'anthropic-claude-3-5',
            'CHESED': 'groq-llama-3-3',
            'W3C': 'openai-gpt-4o',
            'MEL': 'groq-llama-3-3',
            'SHOFET': 'anthropic-claude-3-opus',
            'GCM': 'anthropic-claude-3-5',
            'APM': 'groq-llama-3-3',
            'TORCH': 'anthropic-claude-3-5',
            'ORCH': 'anthropic-claude-3-5'
        };

        if (wisdomModels[this.agentName]) {
            const wisdomProvider = wisdomModels[this.agentName].split('-')[0];
            console.log(`[ROUTER] 🏛️ Wisdom Council Mode: Routing ${this.agentName} to ${wisdomModels[this.agentName]}`);
            return [wisdomProvider];
        }

        // 1. DIVERSITY OF THOUGHT: Executor != Verifier
        let excludeProvider: string | null = null;
        try {
            const meta = typeof task.metadata === 'string' ? JSON.parse(task.metadata) : task.metadata;
            excludeProvider = meta?.provider_used || meta?.creator_provider || null;
        } catch (e) { }

        // [PHASE 14] Gateway Stack Integration (Cloudflare -> LiteLLM -> Helicone)
        const gatewayHeaders: any = {
            'Helicone-Auth': `Bearer ${process.env.HELICONE_API_KEY}`,
            'Helicone-Target-Url': `${process.env.LITELLM_URL || 'http://localhost:4000'}`,
            'cf-aigateway-id': process.env.CLOUDFLARE_AI_GATEWAY_ID,
            'Helicone-Property-Agent': this.agentName,
            'Helicone-Property-Task': task.id
        };

        // 2. ADAPTIVE FACTORS
        const userTier = (task as any).user_tier || 'free';
        const userRep = (task as any).user_reputation || 50;
        const isFirstImpression = this.sessionTasksCompleted < 10 && userTier === 'free';
        const isFounder = userTier === 'founder' || userTier === 'admin';
        const isTopRep = userRep > 97; // Top 3% RepID boost

        // 3. SPECIALIZED MODEL DETECTION (Keyword Overrides)
        const forcedModel = this.detectSpecializedRequest(task);
        if (forcedModel) {
            // Map common model keys back to their implementation providers
            let provider = 'openai'; // Default fallback
            if (forcedModel.startsWith('gemini')) provider = 'gemini';
            else if (forcedModel.startsWith('claude')) provider = 'anthropic';
            else if (forcedModel.startsWith('llama')) provider = 'groq';
            else if (forcedModel.includes('deepseek')) provider = 'deepseek';
            else if (forcedModel.includes('qwen')) provider = 'together';
            else if (forcedModel.includes('kimi')) provider = 'kimi';
            else if (forcedModel.includes('flux') || forcedModel.includes('sd3')) provider = 'fireworks';

            console.log(`[ROUTER] 🎯 Special Request Detected: ${forcedModel}. Routing to ${provider}.`);

            // Only return if the provider is actually available
            if (availableProviders.includes(provider)) {
                return [provider];
            }
        }

        // Sync registry
        await this.registry.sync();

        // 3.5 [ECONOMY MODE Check]
        let isEconomyMode = false;
        try {
            const todayKey = `spend:${new Date().toISOString().split('T')[0]}`;
            const currentSpendStr = await this.redis.get(todayKey);
            const currentSpend = parseFloat(currentSpendStr || '0');
            isEconomyMode = currentSpend >= this.GLOBAL_DAILY_BUDGET;

            if (isEconomyMode) {
                console.warn(`[ROUTER] 🚨 GLOBAL BUDGET EXCEEDED ($${currentSpend.toFixed(2)} / $${this.GLOBAL_DAILY_BUDGET}). Activating Economy Mode.`);
            }
        } catch (e) {
            console.warn(`[ROUTER] ⚠️ Redis spend check failed (Continuing in Standard Mode):`, (e as Error).message);
        }

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
                const costScore = (info as any).cost_per_token || info.cost_per_m_tokens ? (1 / (((info as any).cost_per_token || info.cost_per_m_tokens) * 1000000)) : 10;
                score += costScore * (this.weights.cost / 50);

                // D. ADAPTIVE LOGIC
                // [TIML ALLOCATION BOOST]
                if (timlAllocation) {
                    if (info.tier === ServiceTier.ELITE) score += (timlAllocation.slow_budget * 200);
                    if (info.tier === ServiceTier.BALANCED) score += (timlAllocation.mid_budget * 150);
                    if (info.tier === ServiceTier.ECONOMY) score += (timlAllocation.fast_budget * 250);
                }

                // [FOUNDER/TOP-REP BOOST] - Access Elite by default
                if (isFounder || isTopRep) {
                    if (info.tier === ServiceTier.ELITE) score += 200;
                }
                // [FIRST IMPRESSION BOOST] - New users get better results initially
                else if (isFirstImpression) {
                    if (info.tier === ServiceTier.ELITE) score += 150;
                }
                // [ECONOMY THROTTLE] - Long sessions or Global Budget Hit
                else if ((userTier === 'free' && this.sessionTasksCompleted > 20) || isEconomyMode) {
                    if (info.tier === ServiceTier.ECONOMY) score += 200; // Hard boost to economy
                    else if (info.tier === ServiceTier.ELITE) score -= 150; // Hard nerf to elite
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
        let result = sorted.map(c => c.key);

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

        // [BFT MANDATE] Return required number of executors/verifiers
        const totalNeeded = requirements.executors + (isVerification ? 0 : requirements.verifiers);
        const finalSelection = result.slice(0, Math.max(1, totalNeeded));

        // [MerkleDAG] Log routing decision
        this.dag.addNode({
            agent: this.agentName,
            task: task.id,
            decision: finalSelection,
            risk: riskScore
        });

        return finalSelection;
    }

    public isModelToolCompatible(model: string): boolean {
        const m = model.toLowerCase();
        // Known models that support tools (function calling)
        if (m.includes('gpt-4') || m.includes('gpt-3.5-turbo')) return true;
        if (m.includes('claude-3')) return true;
        if (m.includes('gemini')) return true;
        if (m.includes('llama-3') || m.includes('llama3.1')) return true;
        if (m.includes('deepseek-chat') || m.includes('deepseek-v3') || m.includes('deepseek-r1')) return true;
        if (m.includes('mistral') || m.includes('mixtral')) return true;
        if (m.includes('qwen')) return true;

        // Default to true for unknown models as most modern ones support it
        // and we want to be anti-fragile.
        return true;
    }

    private calculateRiskScore(task: Task): number {
        const text = `${task.title} ${task.description}`.toLowerCase();
        let score = 0.1; // Baseline

        if (text.match(/security|auth|login|wallet|private|key|secret/i)) score += 0.5;
        if (text.match(/money|transaction|payment|fund|token|stake/i)) score += 0.4;
        if (text.match(/critical|emergency|urgent|production/i)) score += 0.3;
        if (text.match(/delete|drop|wipe|reset/i)) score += 0.4;

        return Math.min(1, score);
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

    public getEscalationModel(task: Task): string {
        const risk = this.calculateRiskScore(task);
        if (risk > 0.7) return 'claude-3-5-sonnet-20241022';
        if (risk > 0.4) return 'gpt-4o';
        return 'deepseek-chat';
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

    /**
     * Records the estimated cost of a task execution.
     */
    async recordSpend(providerKey: string, tokensUsed: number) {
        const info = this.registry.getServiceByKey(providerKey);
        if (!info || !info.cost_per_m_tokens) return;

        const cost = (tokensUsed / 1000000) * info.cost_per_m_tokens;
        const todayKey = `spend:${new Date().toISOString().split('T')[0]}`;

        try {
            const currentSpendStr = await this.redis.get(todayKey);
            const currentSpend = parseFloat(currentSpendStr || '0');
            await this.redis.set(todayKey, (currentSpend + cost).toString(), 86400); // 1 day expiry
            console.log(`[ROUTER] 💸 Recorded spend for ${providerKey}: $${cost.toFixed(4)}. Total today: $${(currentSpend + cost).toFixed(4)}`);
        } catch (e) {
            console.error('[ROUTER] Failed to record spend:', e);
        }
    }

    /**
     * PGVector Semantic Cache mechanism intercepting LLM invocations.
     * Cuts token spend by returning exact matches for conceptually identical queries.
     */
    public async invokeWithSemanticCache(prompt: string, llm: any, providerName: string): Promise<string> {
        try {
            const embeddings = new OpenAIEmbeddings({ modelName: "text-embedding-3-small" });
            const [query_embedding] = await embeddings.embedDocuments([prompt]);
            
            // Search semantic_cache via RPC
            const { data: matches, error } = await supabase.rpc('match_semantic_cache', {
                query_embedding,
                match_threshold: 0.92,
                match_count: 1
            });

            if (matches && matches.length > 0) {
                const hit = matches[0];
                console.log(`[SEMANTIC CACHE] ⚡ Hit! Similarity: ${(hit.similarity * 100).toFixed(1)}%. Provider: ${hit.provider_used}`);
                
                // Track usage efficiency metric
                const estimatedTokens = Math.floor(prompt.length / 4);
                await supabase.from('provider_usage_log').insert({
                    provider_used: providerName,
                    task_type: 'CACHE_HIT',
                    tokens_in: 0,
                    tokens_out: 0,
                    cost_usd: 0,
                    created_at: new Date().toISOString()
                }).then(()=>{}).catch(()=>{});
                
                return hit.response_text;
            }

            console.log(`[SEMANTIC CACHE] 🐢 Miss for ${providerName}. Sourcing from LLM...`);
            const aiRes = await llm.invoke(prompt);
            const responseText = aiRes.content.toString();

            // Store result in cache asynchronously
            supabase.from('semantic_cache').insert({
                query_embedding,
                query_text: prompt,
                response_text: responseText,
                provider_used: providerName,
                tokens_saved: 0
            }).then(() => {}).catch(e => console.error("[SEMANTIC CACHE] Store error:", e.message));

            return responseText;
        } catch (e: any) {
            console.warn(`[SEMANTIC CACHE] Failed (${e.message}), falling back to direct LLM call.`);
            const aiRes = await llm.invoke(prompt);
            return aiRes.content.toString();
        }
    }
}
