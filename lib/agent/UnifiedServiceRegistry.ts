import { supabase } from '../supabase';

export enum ServiceTier {
    ELITE = 3,
    BALANCED = 2,
    ECONOMY = 1
}

export interface ServiceDefinition {
    id: string;
    service_key: string;
    service_type: 'llm' | 'image' | 'audio' | 'storage' | 'compute';
    provider: string;
    model_id?: string;
    tier: ServiceTier;
    cost_per_m_tokens: number;
    latency_ms_avg: number;
    is_active: boolean;
    specialties: string[];
    metadata: any;
}

export class UnifiedServiceRegistry {
    private static instance: UnifiedServiceRegistry;
    private services: Map<string, ServiceDefinition> = new Map();
    private lastUpdate: number = 0;
    private REFRESH_INTERVAL = 300000; // 5 minutes

    private constructor() { }

    public static getInstance(): UnifiedServiceRegistry {
        if (!UnifiedServiceRegistry.instance) {
            UnifiedServiceRegistry.instance = new UnifiedServiceRegistry();
        }
        return UnifiedServiceRegistry.instance;
    }

    /**
     * Synchronizes the registry with Supabase trinity_service_registry.
     */
    public async sync() {
        if (Date.now() - this.lastUpdate < this.REFRESH_INTERVAL && this.services.size > 0) return;

        try {
            console.log('[Registry] 🔄 Syncing Service Registry...');
            const { data, error } = await supabase
                .from('trinity_service_registry')
                .select('*')
                .eq('is_active', true);

            if (error) throw error;

            this.services.clear();
            (data || []).forEach((s: any) => {
                this.services.set(s.service_key, {
                    ...s,
                    tier: s.tier as ServiceTier
                });
            });

            this.lastUpdate = Date.now();
            console.log(`[Registry] ✅ Synced ${this.services.size} active services.`);
        } catch (e) {
            console.error('[Registry] ❌ Sync failed:', e);
            // Fallback to static defaults if DB fails
            this.loadStaticDefaults();
        }
    }

    /**
     * Returns a list of services matching a type, sorted by a custom weight function.
     */
    public async getServices(type: string): Promise<ServiceDefinition[]> {
        await this.sync();
        return Array.from(this.services.values())
            .filter(s => s.service_type === type);
    }

    public getServiceByKey(key: string): ServiceDefinition | undefined {
        return this.services.get(key);
    }

    private loadStaticDefaults() {
        // Essential fallbacks in case of DB disconnection
        const defaults: Partial<ServiceDefinition>[] = [
            // ELITE TIERS
            { service_key: 'openai-gpt-4o', service_type: 'llm', provider: 'openai', tier: 3, cost_per_m_tokens: 15.0, specialties: ['logic', 'code'] },
            { service_key: 'anthropic-claude-3-5', service_type: 'llm', provider: 'anthropic', tier: 3, cost_per_m_tokens: 15.0, specialties: ['writing', 'analysis'] },
            { service_key: 'gemini-1.5-pro', service_type: 'llm', provider: 'google', tier: 3, cost_per_m_tokens: 7.0, specialties: ['multimodal', 'huge-context'] },

            // BALANCED TIERS
            { service_key: 'openrouter-llama-3-1-70b', service_type: 'llm', provider: 'openrouter', tier: 2, cost_per_m_tokens: 0.8, specialties: ['chat', 'general'] },
            { service_key: 'portkey-mistral-large', service_type: 'llm', provider: 'portkey', tier: 2, cost_per_m_tokens: 2.0, specialties: ['reasoning'] },

            // ECONOMY TIERS
            { service_key: 'deepseek-r1', service_type: 'llm', provider: 'openrouter', tier: 1, cost_per_m_tokens: 0.27, specialties: ['logic', 'math'] },
            { service_key: 'siliconflow-qwen-2-5', service_type: 'llm', provider: 'siliconflow', tier: 1, cost_per_m_tokens: 0.1, specialties: ['code', 'fast'] }
        ];

        defaults.forEach(d => {
            if (d.service_key) {
                this.services.set(d.service_key, {
                    id: `static-${d.service_key}`,
                    service_key: d.service_key,
                    service_type: 'llm',
                    provider: d.provider || 'unknown',
                    tier: d.tier || ServiceTier.ECONOMY,
                    cost_per_m_tokens: d.cost_per_m_tokens || 0,
                    latency_ms_avg: 100, // Fixed low default for static
                    is_active: true,
                    specialties: d.specialties || [],
                    metadata: {}
                } as ServiceDefinition);
            }
        });
    }
}
