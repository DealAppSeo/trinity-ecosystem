import { Task, ProviderConfig, WisdomProfile } from './types';
import { OpenAIEmbeddings } from "@langchain/openai";
import { AGENT_WISDOM } from './wisdom';
import { UnifiedServiceRegistry, ServiceDefinition, ServiceTier } from './UnifiedServiceRegistry';
import { RedisAdapter } from './RedisAdapter';
import { BFTModel } from './BFTModel';
import { MerkleDAG } from './MerkleDAG';
import { TIMLAllocation } from './TIMLManager';
import { supabaseAdmin as supabase } from '../supabase';

export interface RoutingWeights {
    speed: number;   // 0-100
    quality: number; // 0-100
    cost: number;    // 0-100
    ethics: number;  // 0-100
}

export class IntelligenceRouter {
    private agentName: string;
    private sessionTasksCompleted: number = 0;
    private demotedProviders: Set<string> = new Set();
    private registry: UnifiedServiceRegistry;
    private redis: RedisAdapter;
    private weights: RoutingWeights = { speed: 50, quality: 50, cost: 50, ethics: 70 };
    private GLOBAL_DAILY_BUDGET = parseFloat(process.env.GLOBAL_DAILY_BUDGET || '5.0');
    private dag: MerkleDAG = new MerkleDAG();
    private cache: Map<string, { result: string[], expires: number }> = new Map();

    constructor(agentName: string, weights?: RoutingWeights) {
        this.agentName = agentName;
        this.registry = UnifiedServiceRegistry.getInstance();
        this.redis = RedisAdapter.getInstance();
        if (weights) this.weights = weights;
    }

    async route(task: Task, availableProviders: string[], timlAllocation?: TIMLAllocation): Promise<string[]> {
        // [ANTIFRAGILE] 1. FAST-PATH CACHE
        const cacheKey = `route:${task.id}:${task.title.substring(0, 20)}`;
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expires > Date.now()) {
            console.log(`[ROUTER] ⚡ Local Cache Hit for [${task.title}]`);
            return cached.result;
        }

        // [PHASE 5] Cloudflare KV Routing Cache
        if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_KV_NAMESPACE && process.env.CLOUDFLARE_API_TOKEN) {
            try {
                const kvRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${process.env.CLOUDFLARE_KV_NAMESPACE}/values/${encodeURIComponent(cacheKey)}`, {
                    headers: { 'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` }
                });
                if (kvRes.ok) {
                    const kvCached = await kvRes.json();
                    if (kvCached && kvCached.result) {
                        console.log(`[ROUTER] ☁️ KV Cache Hit for [${task.title}]`);
                        // Hydrate local cache
                        this.cache.set(cacheKey, { result: kvCached.result, expires: Date.now() + 3600000 });
                        return kvCached.result;
                    }
                }
            } catch (e: any) {
                console.warn(`[ROUTER] ⚠️ KV Load Failed: ${e.message}`);
            }
        }

        const riskScore = this.calculateRiskScore(task);
        const requirements = BFTModel.getRequiredPlys(riskScore);
        console.log(`[ROUTER] 🛡️ Risk Score: ${riskScore.toFixed(2)}. Req: ${requirements.executors} Exec, ${requirements.verifiers} Ver.`);

        const isVerification = task.title.includes('[REVIEW]') || task.status === 'done';
        const taskType = task.task_type || 'general';
        const titleAndDesc = `${task.title} ${task.description}`.toLowerCase();
        
        // --- FEATURE EXTRACTION for ANFIS ---
        let complexity = 0.5;
        let latency_required = 0.5;
        let verification_required = isVerification || riskScore > 0.6;
        let cost_sensitivity = 0.5;

        // Fetch Historical Dissent for ANFIS feedback loops
        let history_avg_dissent = 0.1;
        try {
            const { data: priors } = await supabase.from('trinity_domain_priors').select('current_divergence').limit(5);
            if (priors && priors.length > 0) {
                history_avg_dissent = priors.reduce((sum, p) => sum + (p.current_divergence || 0), 0) / priors.length;
            }
        } catch(e) {}
        
        console.log(`[ANFIS] 📜 Historical Dissent Extracted: ${history_avg_dissent.toFixed(2)}`);

        // Fuzzy rules blending History 
        if (history_avg_dissent > 0.2) {
             console.log(`[ANFIS] ⚠️ High historical dissent detected. Pushing verification sensitivity higher.`);
             verification_required = true;
        }

        if (titleAndDesc.match(/audit|complex|bft|consensus|stress|synthesis|verify/i)) complexity = 0.8;
        if (titleAndDesc.match(/simple|draft|warmup|scan/i)) complexity = 0.2;
        
        if (titleAndDesc.match(/real-time|instant|now|fast|speed/i)) latency_required = 0.9;
        
        if (taskType === 'MARKET_SIGNAL' || taskType === 'BFT_CONSENSUS_STRESS') latency_required = 0.85;

        const isNightShift = new Date().getHours() >= 23 || new Date().getHours() < 6;
        if (isNightShift) {
             cost_sensitivity = 0.9; // aggressive burn of free limits first
        }

        const reasoning_heavy = titleAndDesc.match(/reason|logic|math|code|review|antagonist/i) ? true : false;
        const web_data_required = titleAndDesc.match(/search|intel|market|price|github|scrape|news/i) ? true : false;
        const fact_verification_required = titleAndDesc.match(/fact|drift|claim|hallucination|truth/i) ? true : false;
        const high_stakes = riskScore > 0.7 || titleAndDesc.match(/veto|escalation|bft/i) ? true : false;
        const reliability_critical = titleAndDesc.match(/demo|submission|payment/i) ? true : false;

        // Extract previous provider for verification
        let excludeProvider: string | null = null;
        try {
            const meta = typeof task.metadata === 'string' ? JSON.parse(task.metadata) : task.metadata;
            excludeProvider = meta?.provider_used || meta?.creator_provider || null;
        } catch (e) { }

        const SBFA_EXCLUSIONS: Record<string, string[]> = {
            'VERITAS': ['groq-llama', 'together-fallback', 'fireworks-llama'],
            'SHOFET':  ['anthropic-claude', 'openrouter-fallback'],
        };

        // ====== 10+ PROVIDER ROUTING CASCADE ======
        let selectedProviders: string[] = [];

        if (reliability_critical) {
            console.log(`[ROUTER] 🛡️ Reliability Critical: Routing via deepseek-reasoner`);
            selectedProviders.push('deepseek-reasoner');
        } else if (latency_required > 0.8) {
            console.log(`[ROUTER] ⚡ Tier 1 (Fast/Cheap) Priority`);
            selectedProviders.push('groq-llama');
            if (active(availableProviders, 'fireworks-llama')) selectedProviders.push('fireworks-llama');
        } else if (complexity < 0.3 && cost_sensitivity > 0.7) {
            console.log(`[ROUTER] 📉 Simple/Cheap: groq-llama -> fireworks-llama -> together-fallback`);
            selectedProviders.push('groq-llama');
            if (active(availableProviders, 'fireworks-llama')) selectedProviders.push('fireworks-llama');
            if (active(availableProviders, 'together-fallback')) selectedProviders.push('together-fallback');
        } else if (complexity >= 0.3 && complexity <= 0.6 && reasoning_heavy) {
            console.log(`[ROUTER] 🧠 Tier 2 (Reasoning): deepseek-reasoner -> mistral-medium -> openrouter-fallback`);
            selectedProviders.push('deepseek-reasoner');
            if (active(availableProviders, 'mistral-medium')) selectedProviders.push('mistral-medium');
            if (active(availableProviders, 'openrouter-fallback')) selectedProviders.push('openrouter-fallback');
        } else if (fact_verification_required || web_data_required) {
            console.log(`[ROUTER] 🕵️ Fact Verification / Web Data via deepseek-reasoner`);
            selectedProviders.push('deepseek-reasoner');
        } else if (complexity > 0.7 && high_stakes) {
            console.log(`[ROUTER] 🦅 Tier 3 (Constitutional/High Stakes): anthropic-claude`);
            selectedProviders.push('anthropic-claude');
        } else {
            console.log(`[ROUTER] Epistemic Diversity Fallback`);
            selectedProviders.push('deepseek-reasoner');
            selectedProviders.push('groq-llama');
        }

        // Apply Hard Excludes (Verifying agents can't use same provider familiy as generator)
        if (excludeProvider && verification_required) {
            const excludeFamily = this.getEpistemicFamily(excludeProvider);
            selectedProviders = selectedProviders.filter(p => this.getEpistemicFamily(p) !== excludeFamily);
        }

        // Apply SBFA Exclusion Rule (Validator override)
        if (isVerification) {
            const forbiddenModels = SBFA_EXCLUSIONS[this.agentName] || [];
            selectedProviders = selectedProviders.filter(p => !forbiddenModels.includes(p));
        }

        // Ensure we actually have the provider available. 
        // If all selected are unavailable, gracefully fallback down the stack.
        let finalSelection = selectedProviders.filter(p => availableProviders.includes(p) && !this.demotedProviders.has(p));
        
        if (finalSelection.length === 0 && availableProviders.length > 0) {
             console.warn(`[ROUTER] ⚠️ Selected providers exhausted/demoted. Falling back to active: ${availableProviders[0]}`);
             finalSelection = [availableProviders[0]];
        }

        // Trim to required count
        const totalNeeded = requirements.executors + (isVerification ? 0 : requirements.verifiers);
        finalSelection = finalSelection.slice(0, Math.max(1, totalNeeded));

        console.log(`[ROUTER] ✅ Final Routing Select: ${JSON.stringify(finalSelection)}`);

        this.sessionTasksCompleted++;

        // [MerkleDAG] Log routing decision
        this.dag.addNode({
            agent: this.agentName,
            task: task.id,
            decision: finalSelection,
            risk: riskScore
        });

        // Log usage explicitly for Budget Monitor
        for (const p of finalSelection) {
             this.logRoutingSelection(p, taskType);
        }

        // Hydrate local cache
        this.cache.set(cacheKey, { result: finalSelection, expires: Date.now() + 3600000 });

        // [PHASE 5] Persist to Cloudflare KV routing cache
        if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_KV_NAMESPACE && process.env.CLOUDFLARE_API_TOKEN) {
            fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${process.env.CLOUDFLARE_KV_NAMESPACE}/values/${encodeURIComponent(cacheKey)}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ result: finalSelection, timestamp: Date.now() })
            }).catch(e => console.warn(`[ROUTER] ⚠️ KV Save Failed: ${e.message}`));
        }

        return finalSelection;
    }

    private logRoutingSelection(provider: string, taskType: string) {
        // Asynchronously dump to supabase for budget_monitor to pick up
        supabase.from('provider_usage_log').insert({
            provider_used: provider,
            task_type: taskType,
            cost_usd: 0, 
            tokens_in: 0,
            tokens_out: 0,
            created_at: new Date().toISOString()
        }).then(() => {}).catch(() => {});
    }

    public isModelToolCompatible(model: string): boolean {
        return true; 
    }

    private calculateRiskScore(task: Task): number {
        const text = `${task.title} ${task.description}`.toLowerCase();
        let score = 0.1; 

        if (text.match(/security|auth|login|wallet|private|key|secret/i)) score += 0.5;
        if (text.match(/money|transaction|payment|fund|token|stake/i)) score += 0.4;
        if (text.match(/critical|emergency|urgent|production/i)) score += 0.3;
        if (text.match(/delete|drop|wipe|reset/i)) score += 0.4;

        return Math.min(1, score);
    }

    public suggestTools(task: Task): string[] {
        return ['GitHub', 'Sandbox'];
    }

    public getEscalationModel(task: Task): string {
        return 'claude-3-5-sonnet-20241022';
    }

    demote(provider: string) {
        console.warn(`[ROUTER] 📉 Demoting ${provider} due to failure/quota.`);
        this.demotedProviders.add(provider);
        setTimeout(() => this.demotedProviders.delete(provider), 300000);
    }

    private getEpistemicFamily(providerKey: string): string {
        const p = providerKey.toLowerCase();
        if (p.includes('openai') || p.includes('gpt') || p.includes('portkey')) return 'openai';
        if (p.includes('anthropic') || p.includes('claude')) return 'anthropic';
        if (p.includes('google') || p.includes('gemini')) return 'google';
        if (p.includes('meta') || p.includes('llama') || p.includes('groq')) return 'meta';
        if (p.includes('samba') || p.includes('cerebras')) return 'meta'; // based on llama 3 largely
        if (p.includes('mistral') || p.includes('mixtral')) return 'mistral';
        if (p.includes('deepseek')) return 'deepseek';
        return 'independent';
    }

    async recordSpend(providerKey: string, tokensUsed: number) {
        // Implementation remains same
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

function active(avail: string[], candidate: string) {
     return avail.includes(candidate);
}
