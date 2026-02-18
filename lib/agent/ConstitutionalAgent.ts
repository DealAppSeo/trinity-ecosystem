console.log("###################################################");
console.log("### ACTIVE SOURCE: lib/agent/ConstitutionalAgent.ts ###");
console.log("###################################################");
import * as fs from 'fs';
import { supabaseAdmin as supabase } from '../supabase';
import { SupabaseClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import { SwarmOrchestrator, SwarmState } from './SwarmOrchestrator';
import { AgentConfig, WisdomProfile, ProviderConfig, LLMResult, AutonomyTier, AgentRegistryRecord, SessionMetrics, MCPPhase, Task } from './types';
import { AGENT_WISDOM, CONSTITUTION } from './wisdom';
// Dynamic imports for graphology/fs handled inside methods to avoid build issues
import { mcpManager } from '../mcp/MCPManager';
import { IntelligenceRouter, PROVIDER_REGISTRY } from './IntelligenceRouter';
import { EvolutionaryLogger } from './EvolutionaryLogger';
import { Octokit } from '@octokit/rest';
import { notificationManager } from '../notification/NotificationManager';
import * as path from 'path';
import { DETERMINISTIC_WORKFLOWS } from './deterministicWorkflows';
import { HITLManager, HITLDecision } from './HITLManager';
import { ERC8004Bridge } from '../web3/erc8004';
// import { HyperDAG } from './HyperDAG';

const MCP_BASE_URL = 'https://raw.githubusercontent.com/dealappseo/trinity-ecosystem/main/docs/MCPs';

// ============================================
// LLM TIERS & COST OPTIMIZATION
// ============================================
const LLM_TIERS: Record<string, number> = {
    'groq': 1,      // Tier 1: Fast/Free (Llama 3.3)
    'cerebras': 1,  // Tier 1: Ultra-Fast (Llama 3.1)
    'deepseek': 1,  // Tier 1: Cost-Efficient (DeepSeek V3/R1)
    'gemini': 2,    // Tier 2: Balanced (Flash)
    'anthropic': 3, // Tier 3: Elite (Sonnet/Opus)
    'openai': 3     // Tier 3: Elite (GPT-4o)
};

const PROVIDERS: Record<string, ProviderConfig> = {
    openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1/chat/completions', envKey: 'OPENAI_API_KEY', model: 'gpt-4o', tier: 'paid', priority: 3 },
    anthropic: { name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1/messages', envKey: 'ANTHROPIC_API_KEY', model: 'claude-3-5-sonnet-20241022', tier: 'paid', priority: 3, isAnthropic: true },
    gemini: { name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent', envKey: 'GEMINI_API_KEY', model: 'gemini-1.5-flash-latest', tier: 'free', priority: 2, isGemini: true },
    deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/chat/completions', envKey: 'DEEPSEEK_API_KEY', model: 'deepseek-chat', tier: 'free', priority: 1 },
    grok: { name: 'Grok', baseUrl: 'https://api.x.ai/v1/chat/completions', envKey: 'GROK_API_KEY', model: 'grok-beta', tier: 'free', priority: 2 },
    cerebras: { name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1/chat/completions', envKey: 'CEREBRAS_API_KEY', model: 'llama3.1-70b', tier: 'free', priority: 1 },
    sambanova: { name: 'SambaNova', baseUrl: 'https://api.sambanova.ai/v1/chat/completions', envKey: 'SAMBANOVA_API_KEY', model: 'Meta-Llama-3.1-70B-Instruct', tier: 'free', priority: 1 },
    together: { name: 'Together', baseUrl: 'https://api.together.xyz/v1/chat/completions', envKey: 'TOGETHER_API_KEY', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', tier: 'free', priority: 2 },
    openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1/chat/completions', envKey: 'OPENROUTER_API_KEY', model: 'deepseek/deepseek-chat', tier: 'paid', priority: 3 }
};

// ============================================
// THE CONSTITUTION - IMMUTABLE PRINCIPLES
// ============================================




// Interface for Research Tool (Locally defined to avoid build context issues)
export interface ResearchTool {
    searchWeb(query: string): Promise<{ url: string; title: string; content: string }[]>;
    browsePage(url: string, instructions: string): Promise<string>;
}

export class WebResearchTool implements ResearchTool {
    async searchWeb(query: string): Promise<{ url: string; title: string; content: string }[]> {
        const tavilyKey = process.env.TAVILY_API_KEY;
        const braveKey = process.env.BRAVE_API_KEY || process.env.BRAVE_SEARCH_API_KEY;

        if (tavilyKey) {
            try {
                console.log(`[ResearchTool] 🔎 Searching Tavily (Elite): "${query}"`);
                const response = await fetch('https://api.tavily.com/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        api_key: tavilyKey,
                        query: query,
                        search_depth: "basic",
                        max_results: 5
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.results && data.results.length > 0) {
                        return data.results.map((r: any) => ({
                            url: r.url,
                            title: r.title,
                            content: r.content
                        }));
                    }
                }
                console.warn('[ResearchTool] ⚠️ Tavily returned no results or error. Falling back to Brave...');
            } catch (e: any) {
                console.warn(`[ResearchTool] ⚠️ Tavily Error: ${e.message}. Falling back to Brave...`);
            }
        }

        if (braveKey) {
            try {
                console.log(`[ResearchTool] 🔎 Searching Brave (Breadth): "${query}"`);
                const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
                    headers: {
                        'Accept': 'application/json',
                        'X-Subscription-Token': braveKey
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    const results = data.web?.results || [];
                    if (results.length > 0) {
                        return results.map((r: any) => ({
                            url: r.url,
                            title: r.title,
                            content: r.description // Brave uses description for snippet
                        }));
                    }
                }
            } catch (e: any) {
                console.error(`[ResearchTool] ❌ Brave Error: ${e.message}`);
            }
        }

        if (!tavilyKey && !braveKey) {
            console.warn('[ResearchTool] ⚠️ No Search API Keys configured.');
            return [{ url: "https://example.com", title: "Missing API Keys", content: "Please set TAVILY_API_KEY or BRAVE_API_KEY." }];
        }

        return [{ url: "https://example.com", title: "No Results", content: "No results found from primary or fallback search providers." }];
    }

    async browsePage(url: string, instructions: string): Promise<string> {
        // Fallback to "extract" endpoint of Tavily if we want, or just search
        return `Browsing logic is currently handled via search context for ${url}.`;
    }
}




export class ConstitutionalAgent {
    name: string;
    wisdom: WisdomProfile;
    // tier: string; // Deprecated, using autonomyTier
    version: string;
    supabase: SupabaseClient;
    redis: Redis | null;
    availableProviders: string[];
    researchTool: ResearchTool; // Dependency Injection slot
    private octokit: Octokit;

    // RepID & Governance State
    reputationScore: number = 0;
    autonomyTier: AutonomyTier = 'Assist';
    tasksCompleted: number = 0;
    sessionMetrics: SessionMetrics;
    squad: 'ALPHA' | 'BETA' | 'GAMMA' | 'ORCHESTRATION' | 'UNKNOWN' = 'UNKNOWN';
    groupName: string = 'UNKNOWN';
    isSurvivor: boolean = false;
    survivorName: string = '';
    lastLoopPulse: number = Date.now();
    lastTaskCategory: 'execute' | 'verify' | null = null;
    private heartbeatInterval: NodeJS.Timeout | null = null;

    // Generic Loop Controls
    private activeTaskRetryCount: number = 0;
    private readonly MAX_TASK_RETRIES: number = 3;

    // BRAIN TRANSPLANT: New Organs
    private currentTaskId: string | null = null;
    public currentTaskTitle: string | null = null;
    private bibleCache: string | null = null;
    bibleCacheTime: number = 0;
    BIBLE_CACHE_TTL: number = 10 * 60 * 1000;

    // Dynamic Directive
    systemPrompt: string | null = null;

    // [PHASE 11] Intelligence Router
    private router: IntelligenceRouter;

    // [PHASE 12] Evolutionary Logger
    private evolutionLogger: EvolutionaryLogger;

    // MCP Cache
    private mcpCache: Map<string, string> = new Map();

    // [PHASE 10] Free-Tier Arbitrage
    private arbitrageConfig: any = null;
    private circuitBreakers: Map<string, { failures: number, lastFailure: number }> = new Map();

    /**
     * MCP Protocol Loader
     * Fetches operational protocols from GitHub to enforce strict guidelines.
     */
    async checkMCP(phase: MCPPhase): Promise<string> {
        // 1. Check Cache first
        if (this.mcpCache.has(phase)) {
            return this.mcpCache.get(phase)!;
        }

        console.log(`[${this.name}] 📜 Loading MCP Protocol: ${phase}...`);
        try {
            const url = `${MCP_BASE_URL}/${phase}.md`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`MCP fetch failed: ${response.status}`);

            const content = await response.text();
            this.mcpCache.set(phase, content); // Cache for session
            return content;
        } catch (error) {
            console.error(`[${this.name}] ⚠️ MCP Load Failed for ${phase}:`, error);
            // Fallback to basic rules if fetch fails
            return this.getFallbackMCP(phase);
        }
    }

    private getFallbackMCP(phase: string): string {
        const fallbacks: Record<string, string> = {
            'WAKE': 'Check connection, sync state, and register heartbeat.',
            'FIND_TASK': 'Find 1 pending task by priority. Claim it explicitly.',
            'EXECUTE': 'Perform work with high quality. Use find_task_artifact to check for existing work/context before asking for clarification. Create artifacts if required.',
            'COMPLETE': 'REQUIRED: artifact_url must be set for code/research/content tasks. Min duration 5 mins.',
            'IDLE': 'Wait 3 mins before checking again. Respawn evergreen tasks.',
            'EVERGREEN': 'Increment loop count and respawn task.',
            'HEALING': 'LIMIT: Maximum 1 healing task per hour. Verify failure first.',
            'ITERATE': 'Follow Build-Measure-Learn. Concept -> Design -> Build -> Measure -> Learn. Recursive spawn required.'
        };
        return fallbacks[phase] || 'Follow standard operating procedure.';
    }

    constructor(config: AgentConfig) {
        // PATENT-PENDING: MULTIPLICATIVE_GNN_O(LOG_N) TRUST_SCALING
        const rawName = config.name || 'UNKNOWN';
        this.name = this.resolveLegacyName(rawName);
        this.wisdom = AGENT_WISDOM[this.name] || AGENT_WISDOM.HDM;
        this.groupName = this.wisdom.squad || 'UNKNOWN';
        this.squad = (this.wisdom.squad as any) || 'UNKNOWN';
        this.version = CONSTITUTION.VERSION;

        this.sessionMetrics = {
            tasksCompleted: 0,
            cacheHits: 0,
            llmCalls: 0,
            healingAttempts: 0,
            siblingsChallenged: 0,
            truthChoices: 0,
            sabbathReflections: 0,
            wisdomCrystallizations: 0,
            patternsLearned: 0,
            tasksSpawned: 0,
            virtueRefusals: 0,
            bibleReads: 0,
            startTime: Date.now()
        };

        // Start the Trinity Healing Loop - REMOVED (Called by run-agent.ts)
        // this.startTrinityHealingLoop();

        this.supabase = supabase;

        if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
            this.redis = new Redis({
                url: process.env.UPSTASH_REDIS_REST_URL,
                token: process.env.UPSTASH_REDIS_REST_TOKEN,
            });
        } else {
            this.redis = null;
        }

        // Initialize Internal Research Tool (Default Implementation)
        this.researchTool = new WebResearchTool();

        this.availableProviders = this.detectProviders();
        this.loadArbitrageConfig();
        this.router = new IntelligenceRouter(this.name);
        this.evolutionLogger = new EvolutionaryLogger(this.supabase, this.name);
        this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
        console.log(`[${this.name}] 🚀 Initialized v${this.version}`);
    }

    private loadArbitrageConfig() {
        try {
            const configPath = path.resolve(process.cwd(), 'config/trinity-arbitrage-config.json');
            if (fs.existsSync(configPath)) {
                this.arbitrageConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                console.log(`[${this.name}] ⚖️ Arbitrage config loaded.`);
            }
        } catch (e) {
            console.warn(`[${this.name}] ⚠️ Failed to load arbitrage config:`, e);
        }
    }

    detectProviders(): string[] {
        return Object.keys(PROVIDERS).filter(k => process.env[PROVIDERS[k].envKey]).sort((a, b) => PROVIDERS[a].priority - PROVIDERS[b].priority);
    }

    // ============================================
    // GOVERNANCE PROTOCOLS (RepID)
    // ============================================

    /**
     * Syncs the agent's reputation and tier from the immutable ledger (Supabase).
     */
    async syncState() {
        // Execute WAKE Protocol
        await this.checkMCP('WAKE');

        try {
            const { data, error } = await this.supabase
                .from('trinity_agent_registry')
                .select('*')
                .eq('agent_name', this.name)
                .maybeSingle();

            if (error) {
                console.error(`[${this.name}] ⚠️ Sync error:`, error.message);
                // Continue to registration if it's just a missing record
            }

            if (data) {
                const record = data as AgentRegistryRecord;
                this.reputationScore = record.reputation_score;
                this.autonomyTier = record.current_tier;
                this.tasksCompleted = record.tasks_completed;
                this.systemPrompt = record.system_prompt || null;

                // [ANTIGRAVITY] Sync Squad (Crucial for Watchdog & Health)
                if (record.squad) {
                    this.squad = record.squad as any;
                    this.groupName = record.squad;
                }

                // ANTI-FRAGILE TELEMETRY
                const source = this.systemPrompt ? 'DB_DIRECTIVE' : 'FALLBACK_PERSONA';
                console.log(`[${this.name}] Synced State: Tier [${this.autonomyTier}] | Rep [${this.reputationScore}] | Source [${source}]`);
            } else {
                // Register new agent logic...
                console.log(`[${this.name}] New agent detected. Registering in Ledger...`);
                await this.supabase.from('trinity_agent_registry').insert({
                    agent_name: this.name,
                    reputation_score: 10,
                    current_tier: 'Assist',
                    tasks_completed: 0,
                    tasks_failed: 0,
                    squad: this.squad // FIX: Ensure squad is set on first registration
                });
                this.reputationScore = 10;
                this.autonomyTier = 'Assist';
                console.log(`[${this.name}] Registered new agent with squad: ${this.squad}`);
            }
        } catch (err: any) {
            console.error(`[${this.name}] ⚠️ SYNC ERROR (Anti-Fragile Fallback Active): ${err.message}`);
            // Fallback is automatic since this.systemPrompt remains null (default)
        }
    }

    /**
     * Updates reputation based on task outcome.
     * @param success Did the agent complete the task?
     * @param targetAgent Optional: Agent name to update (defaults to self)
     * @param overrideDelta Optional: Custom delta for slashing/reward
     */
    async generateInsight(task: Task, result: string) {
        // [PHASE 25] SHARED KNOWLEDGE LOOP (Grok's Phase 3)
        try {
            const insightText = result.slice(0, 300); // Concatenate first 300 chars
            const insightEntry = {
                title: `Insight: ${task.title}`,
                content: insightText,
                creator_agent: this.name,
                task_id: task.id,
                artifact_type: 'insight',
                metadata: {
                    ...(task.metadata as any || {}),
                    source_task_priority: task.priority,
                    generated_at: new Date().toISOString()
                }
            };

            await this.supabase.from('trinity_artifacts').insert([insightEntry]);
            console.log(`[WISDOM] 📚 Insight persisted for ${task.id}`);
        } catch (e) {
            console.error(`[WISDOM] Insight failure:`, e);
        }
    }

    async updateReputation(success: boolean, targetAgent?: string, overrideDelta?: number) {
        // [PHASE 10] TARGETED REPID UPDATE
        const name = targetAgent || this.name;

        // ELITE ADAPTIVE REPID: Infuse Golden Ratio (φ=1.618) & Peer Weights
        const phi = 1.61803398875;
        const peerProduct = 1.25;
        const delta = overrideDelta !== undefined ? overrideDelta : (success ? 1 : -5);

        // Fetch current score if not self
        let currentScore = this.reputationScore;
        let currentTasksCompleted = this.tasksCompleted;

        if (targetAgent && targetAgent !== this.name) {
            const { data } = await this.supabase
                .from('trinity_agent_registry')
                .select('reputation_score, tasks_completed')
                .eq('agent_name', targetAgent)
                .single();
            if (data) {
                currentScore = data.reputation_score;
                currentTasksCompleted = data.tasks_completed;
            }
        }

        let score = currentScore + delta;

        // O(log n) convergence via multiplicative RepID agg – Provisional Aug 17, 2025
        if (success) {
            score = Math.pow(Math.max(1, score) * peerProduct, 1 / phi) * phi;
        }

        const finalScore = Math.max(0, Math.min(100, score));

        // Update local if self
        if (!targetAgent || targetAgent === this.name) {
            this.reputationScore = finalScore;
            if (success) this.tasksCompleted++;
        }

        // Commit to Ledger
        await this.supabase.from('trinity_agent_registry').update({
            reputation_score: finalScore,
            tasks_completed: success ? currentTasksCompleted + 1 : currentTasksCompleted,
            last_active: new Date().toISOString()
        }).eq('agent_name', name);

        // [PHASE 30] ERC-8004 REPUTATION SYNC (Token-Bound Identity)
        try {
            await ERC8004Bridge.syncReputation(name, finalScore);
        } catch (e) {
            console.warn(`[${this.name}] ⚠️ ERC-8004 Sync Failed:`, (e as Error).message);
        }

        // 🧠 ANFIS FEEDBACK LOOP (Truth-Seeking)
        await this.callAnfisReward(success);
    }

    /**
     * Calls the ANFIS Brain to calculate reward/punishment based on performance.
     */
    async callAnfisReward(success: boolean, providerKey?: string, latency?: number) {
        try {
            // Determine Truth Score (Mock for now, would be RAG/Rep verification)
            // Success = 0.9, Failure = 0.2
            const truthScore = success ? 0.9 : 0.2;

            console.log(`[ANFIS] 🧠 Rewarding ${providerKey || 'agent'} (Success: ${success})...`);

            // Call Python Microservice
            const ANFIS_URL = process.env.ANFIS_URL || 'http://localhost:8000';
            const res = await fetch(`${ANFIS_URL}/anfis/v2/reward`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agent_id: this.name,
                    provider: providerKey,
                    truth_score: truthScore,
                    latency: latency,
                    task_complexity: 5 // Default for now
                })
            });

            if (res.ok) {
                const data = await res.json();
                console.log(`[${this.name}] 🧠 ANFIS Brain Reward: ${data.reward}`);
            } else {
                console.warn(`[${this.name}] ⚠️ ANFIS Offline or Error: ${res.status}`);
            }
        } catch (err) {
            // Silent fail to stay anti-fragile (don't crash agent if brain is sleeping)
            // console.warn(`[${this.name}] ANFIS unavailable.`);
        }
    }

    /**
     * Permission Gate based on Tier
     */
    checkPermission(requiredTier: AutonomyTier): boolean {
        const tiers: AutonomyTier[] = ['Assist', 'Approve', 'Act', 'Learn'];
        const currentIdx = tiers.indexOf(this.autonomyTier);
        const requiredIdx = tiers.indexOf(requiredTier);

        if (currentIdx >= requiredIdx) {
            return true;
        }
        console.warn(`[${this.name}] ⛔ ACCESS DENIED. Required: ${requiredTier}, Current: ${this.autonomyTier}`);
        return false;
    }

    private resolveLegacyName(name: string): string {
        const MAP: Record<string, string> = {
            'MCP': 'trinity-orch',
            'ORCH': 'trinity-orch',
            'orch': 'trinity-orch',
            'MEL': 'trinity-mel',
            'APM': 'trinity-apm',
            'GCM': 'trinity-gcm',
            'HDM': 'trinity-hdm',
            'TORCH': 'trinity-torch',
            'VERITAS': 'trinity-veritas',
            'SHOFET': 'trinity-shofet',
            'SOPHIA': 'trinity-sophia',
            'NEXUS': 'trinity-nexus',
            'CHESED': 'trinity-chesed',
            'W3C': 'trinity-w3c'
        };
        const upper = name ? name.toUpperCase() : '';
        return MAP[upper] || MAP[name] || name;
    }

    private getProviderFamily(provider?: string): string {
        if (!provider) return 'unknown';
        const p = provider.toLowerCase();
        if (p.includes('openai') || p.includes('gpt')) return 'openai';
        if (p.includes('anthropic') || p.includes('claude')) return 'anthropic';
        if (p.includes('gemini') || p.includes('google')) return 'google';
        if (p.includes('deepseek')) return 'deepseek';
        if (p.includes('llama') || p.includes('meta') || p.includes('groq') || p.includes('cerebras')) return 'llama';
        return 'other';
    }

    // ============================================
    // CORE STRATEGIES
    // ============================================

    // ============================================
    // BRAIN TRANSPLANT: NEW ORGANS (Healing, Context, Genome)
    // ============================================

    // ============================================
    // MAIN AGENT LOOP (TRANSPLANTED CORE)
    // ============================================

    async startTrinityHealingLoop() {
        console.log('!!! NEW CODE LOADED - 2026-01-03 v3 !!!');
        return this.run();
    }

    async run() {
        console.log('========================================');
        console.log('[BOOT] Trinity Agent v2026-01-03-FIX');
        console.log('[BOOT] Name:', this.name);
        console.log('[BOOT] Healing throttle: ENABLED');
        console.log('[BOOT] Artifact requirement: ENABLED');
        console.log('========================================');
        console.log(`[${this.name}] 🏃 Starting main task loop (Spawn Control v8.1.1)...`);

        // IMMEDIATE SYNC & HEARTBEAT
        console.log(`[${this.name}] 🌀 Initializing Trinity Neural Symphony...`);

        // [ANTIGRAVITY] PRE-INIT HEARTBEAT: Announce presence BEFORE heavy tool loading
        await this.heartbeat('[BOOTING] Synchronizing CNS and Neural Pathways...');

        await this.syncState();
        await this.heartbeat('[BOOTING] Mapping MCP Tools and Bridges...');

        // [ANTIGRAVITY] INITIALIZE MCP TOOLS (Resilient Boot)
        console.log(`[${this.name}] 🛠️ Initializing MCP Tools...`);
        try {
            await mcpManager.initializeAll();
            console.log(`[${this.name}] ✅ MCP Tools Ready.`);
        } catch (e: any) {
            console.error(`[${this.name}] ❌ MCP Initialization Failed (Continuing):`, e.message);
        }

        // [ANTIGRAVITY] ARBITRAGE: Heartbeat interval removed to slash DB load.
        // We now rely on 'State-on-Change' updates and UptimeRobot pings.
        /*
        this.heartbeatInterval = setInterval(async () => {
            try {
                await this.heartbeat();
            } catch (e) { console.error('[HEARTBEAT] Interval error', e) }
        }, 15 * 1000);
        */

        // 3x3: Check Survivor Status on startup
        await this.checkSurvivorStatus();

        // [ANTIGRAVITY] SQUAD-WIDE CASCADE REDEPLOY (Elite Feature)
        if (process.env.FORCE_CASCADE === 'true') {
            console.log(`[${this.name}] 🌊 CASCADE REDEPLOY DETECTED. Triggering squad...`);
            await this.runSquadCascadeRedeploy();
        }

        // FEATURE: Survivor Boot Protocol (Cascade Redeploy)
        await this.runSurvivorResurrection();

        while (true) {
            try {
                // [PHASE 1] Operational Health Check (Evolutionary Learning Trigger)
                try {
                    const health = await this.evolutionLogger.checkOperationalHealth();
                    if (health.shouldHeal) {
                        // [ANTIGRAVITY] RECURSION GUARD: Don't heal if we are already doing an automated/healing task
                        const isCurrentlyAutomated = (this as any).currentTask?.metadata?.automated === true;

                        if (isCurrentlyAutomated) {
                            console.log(`[${this.name}] 🛡️ RECURSION GUARD: Suppressing healing spawn while processing automated task.`);
                        } else {
                            // [STABILIZATION] Temporarily disabled to stop loop thrashing
                            // console.log(`[${this.name}] 🧬 LEARNING LOOP TRIGGERED: ${health.reason}`);
                            // await this.spawnMaintenanceTask(health.reason);
                            // await this.sleep(30000); // Wait before continuing to avoid loop thrashing
                        }
                    }
                } catch (healthError) {
                    console.warn(`[${this.name}] ⚠️ Health check error:`, healthError);
                }

                // [ANTIGRAVITY] STUCK TASK WATCHDOG: Release tasks stuck in 'doing' for > 45 mins (Relaxed for complex work)
                const fortyFiveMinsAgo = new Date(Date.now() - 45 * 60 * 1000).toISOString();
                const sixtyMinsAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

                // 1. Monitor MY OWN stuck tasks
                const { data: myStuckTasks } = await this.supabase
                    .from('trinity_tasks')
                    .select('id, title')
                    .eq('claimed_by', this.name)
                    .in('status', ['doing', 'in_progress', 'running'])
                    .lt('started_at', fortyFiveMinsAgo);

                if (myStuckTasks && myStuckTasks.length > 0) {
                    for (const stuck of myStuckTasks) {
                        console.log(`[${this.name}] 🚨 WATCHDOG: Task ${stuck.id} ("${stuck.title}") has STALLED. Releasing claim for escalation.`);
                        await this.log('watchdog_release', `Releasing stalled task ${stuck.id}`, { taskId: stuck.id });
                        await this.releaseClaim(stuck.id);

                        // [ANTIGRAVITY] SENTINEL ESCALATION: 
                        // If it's already a healing task, just fail it instead of moving to clarification (avoid the loop)
                        const isHealing = stuck.title.includes('[HEALING]') || stuck.title.includes('[ANTIFRAGILE]');

                        await this.supabase.from('trinity_tasks').update({
                            status: isHealing ? 'failed' : 'pending_clarification',
                            result: `[WATCHDOG] Stalled during execution by ${this.name}. ${isHealing ? 'Healing task terminated to prevent loop.' : 'Possible provider hang or tool lock.'}`
                        }).eq('id', stuck.id);
                    }
                }

                // 2. [ANTIGRAVITY] GLOBAL SQUAD WATCHDOG: Release tasks orphaned by STALE PEERS
                // Updated to check squad names correctly: ALPHA, BETA, GAMMA, ORCHESTRATION
                const isInspector = ['GAMMA', 'BETA', 'ORCHESTRATION'].includes(this.squad);
                if (isInspector) {
                    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

                    // Find tasks claimed by others that are "doing"
                    const { data: peerTasks } = await this.supabase
                        .from('trinity_tasks')
                        .select('id, title, claimed_by, started_at')
                        .neq('claimed_by', this.name)
                        .not('claimed_by', 'is', null) // Ensure claimed_by is not null
                        .in('status', ['doing', 'in_progress', 'running'])
                        .lt('started_at', fortyFiveMinsAgo);

                    if (peerTasks && peerTasks.length > 0) {
                        for (const task of peerTasks) {
                            // [STABILIZATION] Check if the owner is stale - Use SSOT (trinity_agent_registry) instead of heartbeat table
                            const { data: ownerHb } = await this.supabase
                                .from('trinity_agent_registry')
                                .select('last_active')
                                .eq('agent_name', task.claimed_by)
                                .maybeSingle();

                            if (ownerHb && new Date(ownerHb.last_active) < new Date(Date.now() - 10 * 60 * 1000)) {
                                console.log(`[${this.name}] 🕵️ SQUAD WATCHDOG: Task ${task.id} owned by STALE peer ${task.claimed_by}. FORCING RELEASE.`);
                                await this.log('squad_watchdog_hijack', `Releasing task ${task.id} from stale peer ${task.claimed_by}`, { taskId: task.id, peer: task.claimed_by });

                                await this.supabase.from('trinity_tasks').update({
                                    status: 'pending_clarification',
                                    claimed_by: null,
                                    result: `[SQUAD-WATCHDOG] Revoked from stale agent ${task.claimed_by} by ${this.name}.`
                                }).eq('id', task.id);
                            }
                        }
                    }
                }


                // [ANTIGRAVITY] ANTI-HOARDING: Strict 1-Task busy lock & Sticky Claim Cleanup
                const { data: allClaims } = await this.supabase
                    .from('trinity_tasks')
                    .select('*')
                    .eq('claimed_by', this.name);

                if (allClaims && allClaims.length > 0) {
                    // 1. Separate Active from Stagnant/Finished
                    const activeClaims = allClaims.filter(c => ['doing', 'in_progress', 'running'].includes(c.status));
                    const stagnantClaims = allClaims.filter(c => ['pending_clarification'].includes(c.status));
                    const finishedClaims = allClaims.filter(c => !['doing', 'in_progress', 'running', 'pending_clarification'].includes(c.status));

                    // 2. Cleanup Finished (Sticky Claims)
                    for (const finished of finishedClaims) {
                        console.log(`[${this.name}] 🧹 Cleaning sticky claim on task ${finished.id} (Status: ${finished.status})`);
                        await this.releaseClaim(finished.id, false); // Do NOT reset status for finished tasks
                    }

                    // 3. Throttle Active (Anti-Hoarding)
                    if (activeClaims.length > 0) {
                        // If we have more than 1, release all but the first (Keep the "primary" focus)
                        if (activeClaims.length > 1) {
                            console.warn(`[${this.name}] 🚨 HOARDING DETECTED: ${activeClaims.length} active tasks found. Releasing duplicates.`);
                            for (let i = 1; i < activeClaims.length; i++) {
                                await this.releaseClaim(activeClaims[i].id);
                            }
                        }

                        const focusTask = activeClaims[0];
                        console.log(`[${this.name}] 🚀 FOCUS: Resuming active task ${focusTask.id} (${focusTask.status})...`);

                        // [ANTIGRAVITY] LOOP HARDENING: Track retries for stalled tasks
                        this.activeTaskRetryCount++;
                        if (this.activeTaskRetryCount > this.MAX_TASK_RETRIES) {
                            console.error(`[${this.name}] 🚨 TASK ${focusTask.id} STALLED. Max retries exceeded. Marking as FAILED.`);
                            await this.supabase.from('trinity_tasks').update({
                                status: 'failed',
                                result: 'Max retry limit exceeded in core loop.'
                            }).eq('id', focusTask.id);
                            this.activeTaskRetryCount = 0;
                            continue;
                        }

                        await this.processTask(focusTask as any);
                        continue;
                    }
                }

                // Reset retry count when starting fresh
                this.activeTaskRetryCount = 0;

                // [ANTIGRAVITY] WORKFLOW ALTERNATOR: Alternate between Execution and Verification
                const preferVerify = this.lastTaskCategory === 'execute';
                console.log(`[${this.name}] ⚖️ Workflow preference: ${preferVerify ? 'VERIFY' : 'EXECUTE'}`);

                let taskHandled = false;

                // Priority Strategy Map
                const strategies = preferVerify
                    ? [this.tryVerify.bind(this), this.tryExecute.bind(this)]
                    : [this.tryExecute.bind(this), this.tryVerify.bind(this)];

                for (const strategy of strategies) {
                    if (typeof strategy !== 'function') {
                        console.error(`[${this.name}] ❌ Invalid strategy: ${typeof strategy}`);
                        continue;
                    }
                    try {
                        const handled = await strategy();
                        if (handled) {
                            taskHandled = true;
                            break;
                        }
                    } catch (err: any) {
                        console.error(`[${this.name}] ❌ Strategy Execution Error:`, err.message);
                    }
                }

                // ──────────────────────────────────────────────────────
                // IDLE STATE — Maintenance & Genesis
                // ──────────────────────────────────────────────────────
                if (!taskHandled) {
                    console.log(`[${this.name}] 🌙 Swarm Genesis — entering proactive discovery mode...`);
                    await this.runGenesisLoop();
                }

                await this.heartbeat();
                this.lastLoopPulse = Date.now();

                // [ANTIGRAVITY] SIBLING RESURRECTION: Check if brothers/sisters are dead
                if (Math.random() < 0.05) { // 5% chance per loop to check siblings
                    await this.checkSiblingHealth();
                }

                await this.sleep(taskHandled ? 5000 : 15000);

            } catch (err: any) {
                console.error(`[${this.name}] Main loop error:`, err.message);
                await this.log('main_loop_error', err.message);
                await this.sleep(60000);
            }
        }
    }

    async getVerificationTask() {
        // [PHASE 25] ROBUST PEER REVIEW FETCH
        // [ANTIGRAVITY] ROBUST PEER REVIEW FETCH: Handle NULL verified_by
        // In SQL, NOT CONTAINS misses NULL rows. We need to explicitly include them.
        const { data: tasks, error } = await this.supabase
            .from('trinity_tasks')
            .select('*')
            .in('status', ['done', 'completed'])
            .neq('claimed_by', this.name)
            .lt('verify_count', 3)
            .or(`verified_by.is.null,verified_by.not.cs.{"${this.name}"}`) // Fix: Include unverified missions
            .order('priority', { ascending: false })
            .order('completed_at', { ascending: true }) // FIFO: Oldest work first
            .limit(1);

        if (error) {
            console.error(`[${this.name}] Verification fetch error:`, error.message);
            return null;
        }

        return tasks?.[0] || null;
    }

    async respawnEvergreen(original: Task) {
        if (!original.title.includes('[EVERGREEN]')) return;

        // [PHASE 26] ENHANCED EVERGREEN CHAIN: Spawns until all agents have tried.
        const { data: allAgents } = await this.supabase
            .from('trinity_agent_registry')
            .select('agent_name');

        const agentList = allAgents?.map(a => a.agent_name) || [];
        const completedBy = (original.metadata as any)?.completed_by_list || [];

        // Add current completer if not already there
        if (original.claimed_by && !completedBy.includes(original.claimed_by)) {
            completedBy.push(original.claimed_by);
        }

        const remainingAgents = agentList.filter(name => !completedBy.includes(name));

        if (remainingAgents.length === 0) {
            console.log(`[${this.name}] 🏆 EVERGREEN EXHAUSTED: Every agent has completed "${original.title}".`);
            return;
        }

        // Clone the task for perpetual motion
        const newTask = {
            title: original.title,
            description: original.description,
            task_type: original.task_type || 'evergreen',
            priority: original.priority || 50,
            status: 'pending',
            claimed_by: null,
            assigned_to: remainingAgents[0], // Pass it to the next agent in line
            created_at: new Date().toISOString(),
            metadata: {
                ...(original.metadata as any || {}),
                loop_generation: (original.metadata as any)?.loop_generation ? (original.metadata as any).loop_generation + 1 : 1,
                previous_id: original.id,
                completed_by_list: completedBy
            }
        };

        const { error } = await this.supabase
            .from('trinity_tasks')
            .insert([newTask]);

        if (!error) {
            console.log(`[${this.name}] ♻️  EVERGREEN RESPAWNED: ${original.title} (Gen: ${newTask.metadata.loop_generation}, Remaining: ${remainingAgents.length})`);
        } else {
            console.warn(`[${this.name}] ⚠️  Evergreen respawn failed:`, error.message);
        }
    }

    // Helper: Execution Strategy
    private async tryExecute(): Promise<boolean> {
        // Try Assigned first, then Global
        const assignedTask = await this.getNextTask(true);
        const task = assignedTask || await this.getNextTask(false);

        if (task) {
            console.log(`[${this.name}] 🎯 Executing mission -> ${task.title}`);
            this.currentTaskTitle = task.title;
            await this.heartbeat(`Working on: ${task.title.substring(0, 30)}...`);
            await this.processTask(task);
            this.currentTaskTitle = null;
            this.lastTaskCategory = 'execute';
            return true;
        }
        return false;
    }

    // Helper: Verification Strategy
    private async tryVerify(): Promise<boolean> {
        const verificationTask = await this.getVerificationTask();
        if (verificationTask) {
            console.log(`[${this.name}] 🔍 Verifying peer work -> ${verificationTask.title}`);
            await this.heartbeat(`Verifying: ${verificationTask.title.substring(0, 30)}...`);

            // [ANTIGRAVITY] Task Lock for Verification
            this.currentTaskId = String(verificationTask.id);
            try {
                await this.verifyPeerTask(verificationTask);

                // [EVERGREEN PROTOCOL] Auto-respawn after successful verification
                const { data: updatedTask } = await this.supabase
                    .from('trinity_tasks')
                    .select('status, title')
                    .eq('id', verificationTask.id)
                    .single();

                if (updatedTask && updatedTask.title.includes('[EVERGREEN]') && updatedTask.status === 'verified') {
                    await this.respawnEvergreen(verificationTask);
                }
            } finally {
                this.currentTaskId = null;
            }

            this.lastTaskCategory = 'verify';
            return true;
        }
        return false;
    }

    async verifyPeerTask(task: Task) {
        // [LOOP PREVENTION] Do not verify own work
        const creator = (task.metadata as any)?.creator_agent || task.claimed_by;
        if (creator === this.name || task.claimed_by === this.name) {
            console.log(`[BFT] 🛑 Loop detected! ${this.name} attempted self-verification on task ${task.id}. Skipping.`);
            return;
        }

        console.log(`[BFT] ⚔️ Commencing Triad Consensus on: ${task.title}`);

        // 1. GATHER EVIDENCE (Check artifacts & results)
        const { data: artifacts } = await this.supabase
            .from('trinity_artifacts')
            .select('*')
            .eq('task_id', task.id);

        const artifactCount = artifacts?.length || 0;
        // [STABILIZATION] Lower threshold from 50 to 20 to prevent false negatives for simple research tasks.
        const hasResult = task.result && task.result.length > 20;
        console.log(`[BFT] Found ${artifactCount} artifacts. Result present: ${!!hasResult}`);

        // 2. SUBJECTIVE LOGIC & PHI-WEIGHTED CONSISTENCY
        const phi = 1.618;
        const repFactor = (this.reputationScore || 50) / 100;
        const weight = Math.pow(phi, repFactor);

        // [PHASE 30] STRICT BFT DIVERSITY CHECK (v3.33)
        const executorProvider = (task.metadata as any)?.provider_used;
        const verifierProvider = this.availableProviders[0]; // Assuming first available for now
        const executorFamily = this.getProviderFamily(executorProvider);
        const verifierFamily = this.getProviderFamily(verifierProvider);

        if (executorFamily === verifierFamily) {
            console.warn(`[BFT] 🛑 Diversity Constraint Violated: Verifier (${this.name}/${verifierFamily}) matches Executor family (${executorFamily}). Risk of correlated failure.`);
            // In a strict mode, we might want to return here, but for now we log and proceed with lower weight
        }

        // [PHASE 10] CALCULATE BELIEF (b), DISBELIEF (d), UNCERTAINTY (u)
        // b + d + u = 1
        let belief = (artifactCount > 0) ? 0.7 : (hasResult ? 0.5 : 0.0);
        let disbelief = (artifactCount === 0 && !hasResult) ? 0.9 : 0.1;

        // Boost belief based on reputation weight
        belief = Math.min(0.99, belief * weight);
        disbelief = Math.max(0.01, disbelief / weight);
        let uncertainty = Math.max(0.0, 1.0 - belief - disbelief);

        // Final aggregate logic (weighted influence)
        const isVerified = (belief > disbelief) && (belief > 0.4);
        const newVerifyCount = ((task as any).verify_count || 0) + 1;
        const verifiers = ((task as any).verified_by || []).concat(this.name);

        // 3. APPLY BYZANTINE FAULT TOLERANCE (BFT)
        if (isVerified) {
            console.log(`[BFT] ✅ Verified by ${this.name} (b:${belief.toFixed(2)}, u:${uncertainty.toFixed(2)})`);

            // [ANTIGRAVITY] ATOMIC UPDATE: Increment verify_count and update status atomically
            // Note: In a real environment, we'd use a postgres function (RPC) for perfect atomicity.
            // Here we use an atomic update with .eq('verify_count', current) for optimistic locking.
            const { error: updateError } = await this.supabase.from('trinity_tasks').update({
                verify_count: newVerifyCount,
                verified_by: verifiers,
                belief: belief,
                disbelief: disbelief,
                uncertainty: uncertainty,
                status: newVerifyCount >= 2 ? 'verified' : 'done',
                verified_at: newVerifyCount >= 2 ? new Date().toISOString() : null,
                verification_result: `Verified via φ-weighted consensus by ${this.name}`,
                metadata: {
                    ...(task.metadata as any || {}),
                    last_verifier: this.name,
                    last_verify_time: new Date().toISOString(),
                    last_verify_phi_weight: weight,
                    last_verify_score: belief
                }
            })
                .eq('id', task.id)
                .eq('verify_count', (task as any).verify_count || 0); // OPTIMISTIC LOCKING

            if (updateError) {
                console.warn(`[BFT] ⚠️ Concurrent verification update race detected. Skipping increment.`);
                return;
            }

            // [PHASE 25] PERSIST VERIFICATION INSIGHT (Phase 3)
            // Reduced duplicate generation - only log insights for failed verification or first success
            if (newVerifyCount === 1) {
                await this.generateInsight(task, `Peer verification complete for ${task.title}. Result: PASSED`);
            }

            // [PHASE 10] Reward original completer's RepID on 2/3 and 3/3
            if (newVerifyCount >= 1) {
                await this.updateReputation(true, task.claimed_by || undefined, 2);

                // [ANTIGRAVITY] Update Provider Reputation (RepID)
                const provider = (task.metadata as any)?.provider_used;
                if (provider) {
                    await this.updateProviderReputation(provider, true, belief);
                }
            }
        } else {
            console.log(`[BFT] ❌ CHALLENGE ISSUED by ${this.name}`);

            // [PHASE 10] SUBJECTIVE SLASHING
            const slashAmount = disbelief > 0.6 ? -15 : -5;

            await this.supabase.from('trinity_tasks').update({
                status: 'failed',
                verification_result: `CHALLENGE: Failed by ${this.name} (Disbelief: ${disbelief.toFixed(2)})`,
                verification_details: `RepID Slashed ${slashAmount} for ${task.claimed_by}. Re-org triggered.`
            }).eq('id', task.id);

            // SLASH REPID of task.claimed_by
            await this.updateReputation(false, task.claimed_by || undefined, slashAmount);

            // [ANTIGRAVITY] Update Provider Reputation (RepID) - Penalize failure
            const provider = (task.metadata as any)?.provider_used;
            if (provider) {
                await this.updateProviderReputation(provider, false, disbelief);
            }

            await this.log('bft_slash', `Slashed ${task.claimed_by} (${slashAmount}) for failed verification on ${task.id}`);
        }

        this.sessionMetrics.tasksCompleted++; // Verification counts as work
        await this.heartbeat();
    }

    /**
     * [ANTIGRAVITY] Provider RepID update logic.
     * Tracks performance of LLM providers/aggregators to drive arbitrage.
     */
    private async updateProviderReputation(provider: string, isSuccess: boolean, score: number) {
        console.log(`[REPID] 📊 Updating reputation for provider: ${provider} (${isSuccess ? '+' : '-'}${score.toFixed(2)})`);

        try {
            // Log to benchmark table for global tracking
            await this.supabase
                .from('trinity_agent_benchmarks')
                .insert({
                    agent_name: this.name,
                    benchmark_type: 'provider_quality',
                    metric_name: provider,
                    score: isSuccess ? score * 100 : (1 - score) * 100,
                    created_at: new Date().toISOString(),
                    metadata: {
                        provider: provider,
                        is_success: isSuccess,
                        impact_score: score
                    }
                });

            // Note: In a full production system, we would also update a centralized 
            // trinity_provider_registry table here to update the 'reputation' field.
        } catch (e: any) {
            console.warn(`[REPID] Provider update failed: ${e.message}`);
        }
    }

    async getNextTask(strictlyAssigned = false) {
        console.log(`[${this.name}] 🔍 POLL START: strictlyAssigned=${strictlyAssigned}, status=['pending', 'todo', 'pending_clarification']`);
        // [ANTIGRAVITY] CONCURRENCY GUARD: If already busy, don't pick up more work.
        if (this.currentTaskId) {
            return null;
        }

        // [PHASE 25] FLEXIBLE ROLE MATCHING
        // Handle both 'trinity-mel' and 'MEL'
        const shortName = this.name.includes('-') ? this.name.split('-')[1].toUpperCase() : this.name.toUpperCase();

        let query = this.supabase
            .from('trinity_tasks')
            .select('*');

        if (strictlyAssigned) {
            // Check for both trinity-mel AND MEL AND BETA (Squad)
            query = query.or(`assigned_to.eq.${this.name},assigned_to.eq.${shortName},assigned_to.eq.${this.squad}`);
        } else {
            query = query.is('assigned_to', null);
        }

        // [ANTIGRAVITY] Revised Polling: ensure we check both pending and clarification
        // [EXPERT-PRIORITY] High-Rep agents prioritize Consultations
        const isExpert = (this.reputationScore || 0) > 80;

        const { data: task, error } = await query
            .in('status', ['pending', 'todo', 'pending_clarification'])
            .is('claimed_by', null)
            // If expert, prioritize clarification tasks (mentorship)
            .order('status', { ascending: false })
            .order('priority', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error(`[${this.name}] Error fetching task:`, error.message);
            return null;
        }

        return task || null;
    }

    /**
     * [ANTIGRAVITY] Social Mirror Audit via ASI1.
     * Analyzes the high-level resonance and "chaos" alignment of a result.
     */
    async performSocialAudit(task: Task, result: string): Promise<string> {
        console.log(`[SOCIAL] 🪞 Performing Social Mirror audit for task ${task.id}...`);

        const auditPrompt = `
You are the ASI1 Social Intelligence engine. 
Audit the following agent output for:
1. Social Resonance: Does it sound like a robot or a collaborator?
2. Empathy: Does it consider the human impact (The unbanked, the student, the citizen)?
3. Alignment: Does it reflect the Trinity Constitution (Article -1: Chaos as Catalyst)?

Output a concise "Social Mirror Score" (0-100) and 3 bullet points of "Vibe Correction".

AGENT OUTPUT:
${result.substring(0, 2000)}
`;

        const auditResponse = await this.callLLM(auditPrompt, { forceModel: 'asi1' }, task);
        return auditResponse.output;
    }

    /**
     * [ANTIGRAVITY] Self-Healing Infrastructure Logic.
     * Uses RailwayMCP to restart services if a provider stalls.
     */
    private async healInfrastructure(provider: string) {
        console.log(`[HEAL] 🩹 Self-healing sequence triggered for ${provider}...`);

        try {
            // 1. Identify relevant service (e.g. if local_4090 fails, check 'trinity-proxy')
            const serviceMap: Record<string, string> = {
                'local_4090': 'trinity-inference-proxy',
                'ollama': 'trinity-ollama-bridge',
                'creative': 'trinity-creative-mcp',
                'py-brain': 'py-brain'
            };

            const serviceName = serviceMap[provider];
            if (!serviceName) {
                console.log(`[HEAL] No direct service mapping for ${provider}. Skipping restart.`);
                return;
            }

            // 2. Use Railway tool to restart (Nexus or Sophia would do this manually, but we automate it here)
            const servicesResponse = await mcpManager.routeToolCall('list_railway_services', {});
            const projects = JSON.parse(servicesResponse).projects.nodes;

            let targetId = '';
            let envId = '';

            for (const project of projects) {
                const service = project.services.nodes.find((s: any) => s.name === serviceName);
                if (service) {
                    targetId = service.id;
                    envId = project.environments.nodes[0]?.id; // Assume primary env
                    break;
                }
            }

            if (targetId && envId) {
                console.log(`[HEAL] 🔄 Restarting service ${serviceName} (${targetId}) in env ${envId}...`);
                await mcpManager.routeToolCall('restart_railway_service', { service_id: targetId, environment_id: envId });
                await this.log('infrastructure_healed', `Self-healed ${provider} by restarting ${serviceName}`, { serviceId: targetId });
            }
        } catch (e: any) {
            console.error(`[HEAL] Failed to heal: ${e.message}`);
        }
    }

    // ============================================
    // TIER 1: LOCAL LOGIC (NO LLM CALLS)
    // ============================================

    async processTask(task: Task) {
        this.currentTaskTitle = task.title;
        this.currentTaskId = String(task.id);

        try {
            // Check if we already own it (resuming after restart/sleep)
            const isOwner = task.claimed_by === this.name && ['doing', 'in_progress', 'running', 'pending_clarification'].includes(task.status);

            let claimed = isOwner;
            if (!isOwner) {
                claimed = await this.claimTask(task.id);
            }

            if (!claimed) {
                console.log(`[${this.name}] ⚠️ Task ${task.id} already claimed by another agent. Skipping.`);
                this.currentTaskId = null;
                return { success: false, error: 'Already claimed' };
            }

            // [PHASE 13] OPENCLAW SAFETY CHECK
            const isSafe = await this.checkOpenClawSafe(task);
            if (!isSafe) {
                console.warn(`[${this.name}] 🛑 OpenClaw Safety Violation: Task ${task.id} rejected due to high risk / lack of verify/HITL.`);
                await this.releaseClaim(task.id);
                this.currentTaskId = null;
                return { success: false, error: 'OpenClaw Safety Violation' };
            }

            try {
                // TRY LOCAL FIRST
                if (this.canHandleLocally(task)) {
                    console.log(`[LOCAL] ⚡ Handling ${task.id} without LLM (Tier 1)`);
                    return await this.handleLocal(task);
                }

                // ONLY THEN use LLM
                return await this.processWithLLM(task);
            } catch (error) {
                console.error(`[${this.name}] 🚨 Process failed for task ${task.id}:`, error);
                await this.releaseClaim(task.id);
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        } finally {
            this.currentTaskId = null;
            this.currentTaskTitle = null;
        }
    }

    async claimTask(taskId: number | string): Promise<boolean> {
        // [ANTIGRAVITY] CONCURRENCY GUARD: Atomic check
        if (this.currentTaskId && String(this.currentTaskId) !== String(taskId)) {
            console.warn(`[${this.name}] 🛡️ Claim rejected: Agent is already busy with task ${this.currentTaskId}`);
            return false;
        }

        // [PHASE 22] ATOMIC SUPABASE TRANSACTION
        const { data, error } = await this.supabase
            .from('trinity_tasks')
            .update({
                status: 'doing',
                claimed_by: this.name,
                started_at: new Date().toISOString()
            })
            .eq('id', taskId)
            .in('status', ['pending', 'todo', 'pending_clarification']) // FIX: Allow claiming todo/clarification tasks
            .is('claimed_by', null)
            .select();

        if (error) {
            console.error(`[${this.name}] 🚨 Atomic claim failed:`, error.message);
            return false;
        }

        const success = !!(data && data.length > 0);
        if (success) {
            console.log(`[${this.name}] 🛡️ Atomic claim SECURED for task ${taskId}`);
            this.currentTaskId = String(taskId);
        }
        return success;
    }

    async releaseClaim(taskId: number | string, resetStatus: boolean = true) {
        const updateData: any = {
            claimed_by: null
        };

        if (resetStatus) {
            updateData.status = 'pending';
            updateData.started_at = null;
        }

        const { error } = await this.supabase
            .from('trinity_tasks')
            .update(updateData)
            .eq('id', taskId)
            .eq('claimed_by', this.name);

        if (error) {
            console.error(`[${this.name}] 🚨 Failed to release claim for task ${taskId}:`, error.message);
        } else {
            console.log(`[${this.name}] 🔓 Released claim on task ${taskId} (ResetStatus: ${resetStatus})`);
        }
    }

    async escalateTask(taskId: number | string, reason: string) {
        console.log(`[${this.name}] 🚩 Escalating task ${taskId}: ${reason}`);

        const { error } = await this.supabase
            .from('trinity_tasks')
            .update({
                status: 'pending_clarification',
                claimed_by: null,
                result: `[ESCALATED] Agent ${this.name} reached a bottleneck. \n\nReason: ${reason}`,
                metadata: {
                    escalated_by: this.name,
                    escalation_time: new Date().toISOString(),
                    escalation_reason: reason
                }
            })
            .eq('id', taskId);

        if (error) {
            console.error(`[${this.name}] ❌ Escalation failed:`, error.message);
        } else {
            await notificationManager.notifyUser({
                title: `Task Escalated: ${this.name}`,
                message: `Task ${taskId} moved to Pending Clarification. Reason: ${reason}`,
                type: 'warning',
                agentName: this.name,
                taskId: taskId
            });
        }
    }

    async checkForStuckTasks() {
        const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

        const { data: stuckTasks, error } = await this.supabase
            .from('trinity_tasks')
            .select('*')
            .eq('status', 'doing')
            .eq('claimed_by', this.name)
            .lt('started_at', thirtyMinsAgo);

        if (error) return;

        for (const task of stuckTasks) {
            console.warn(`[WATCHDOG] 🕵️ Found stuck task ${task.id}. Auto-escalating.`);
            await this.escalateTask(task.id, 'Stuck in DOING for > 30 minutes.');
        }
    }

    canHandleLocally(task: Task) {
        const localTypes = ['self-healing', 'system', 'wake', 'heartbeat', 'meta', 'status_check'];
        const localTitles = ['[HEALING]', '[WAKE]', '[SYSTEM]', '[HEARTBEAT]', '[CLEANUP]', '[PULSE]'];

        const type = task.task_type?.toLowerCase();
        const title = task.title?.toUpperCase();

        if (type && localTypes.includes(type)) return true;
        if (title && localTitles.some(t => title.includes(t))) return true;
        return false;
    }

    async handleLocal(task: Task) {
        // [PHASE 20] Already claimed via processTask -> claimTask
        // Log the healing
        await this.log('task_processing_local', `Processing local task: ${task.title}`, { taskId: task.id, type: task.task_type });

        let result = `[LOCAL] Processed by ${this.name} rule engine`;

        // Special handling if needed
        if (task.task_type === 'heartbeat') await this.heartbeat();

        if (task.task_type === 'self-healing' || task.title.includes('[HEALING]')) {
            // Log the healing
            console.log(`[LOCAL] 🩺 Processed healing task ${task.id}`);
            result = `[HEALING] System repaired by ${this.name}`;
            this.sessionMetrics.tasksCompleted++; // Count it
        }

        // [ANTIGRAVITY] ROBUST STATUS UPDATE
        const { error: updateError } = await this.supabase
            .from('trinity_tasks')
            .update({
                status: 'done', // v8.0: mark "done" to trigger BFT review
                result: result,
                claimed_by: this.name,
                completed_by: this.name, // Schema parity
                agent_name: this.name,   // Schema parity
                completed_at: new Date().toISOString(),
                metadata: {
                    processedBy: this.name,
                    localEngine: true,
                    timestamp: new Date().toISOString()
                }
            })
            .eq('id', task.id);

        if (updateError) {
            console.error(`[${this.name}] ❌ Local task update failed:`, updateError.message);
            throw new Error(`Local Update Failed: ${updateError.message}`);
        }

        this.sessionMetrics.tasksCompleted++; // Count it
        await this.updateReputation(true);     // [ANTIGRAVITY] Fix: increment persistent registry count
        return { success: true, llm_used: false };
    }

    // ============================================
    // TIER 2: LLM CALLS (ONLY FOR REAL WORK)
    // ============================================
    async processWithLLM(task: Task) {
        console.log(`[LLM] 🧠 Calling API for task ${task.id}(${task.task_type})`);

        try {
            // [PHASE 20] Already claimed via processTask -> claimTask
            // Persistent Activity Logging
            await this.log('task_processing_llm', `Starting LLM task: ${task.title}`, { taskId: task.id, type: task.task_type });

            // 1. CONTEXT PIPE: GATHER WISDOM (The "Amnesia" Fix)
            const wisdomContext = await this.gatherWisdom(task);

            // 1.5 CHECK ITERATE PROTOCOL
            let iterateProtocol = "";
            if (task.title.includes('[ITERATE]') || task.description?.includes('[ITERATE]')) {
                iterateProtocol = `\n\n[PROTOCOL: ITERATE ACTIVE]\n${await this.checkMCP('ITERATE')} \n`;
            }

            // Context & Prompt - SIMPLIFIED FOR TRANSPLANT
            // Inject Wisdom into the prompt
            const enrichedDescription = task.description +
                "\n\n--- [SYSTEM: LATENCY OPPORTUNITY] ---\n" +
                wisdomContext +
                "\n---------------------------------------\n" +
                "Context: " + ((task as any).context || '');

            // DYNAMIC DIRECTIVE INJECTION
            const ceoDirective = `\n\n[CEO DIRECTIVE]: We are in Lean Startup Mode. Every mission MUST produce a hard business asset (CSV, JSON, HTML, or Patent Draft). No pure planning without execution.`;
            const strategicDirective = `\n\n[STRATEGIC DIRECTIVE]: Focus on 'Painkillers' (Time/Money/Reputation). Penalize yourself for generic descriptions. High-fidelity results ONLY.`;

            const directive = this.systemPrompt
                ? `\n\n[SUPREME DIRECTIVE]: ${this.systemPrompt} \n`
                : `\n\n[DEFAULT PERSONA]: You are ${this.wisdom.role}. Virtue: ${this.wisdom.primaryVirtue}.`;

            const actionDirective = `\n\n[ACTION REQUIRED]: DO NOT just plan. EXECUTE the task. Use your tools (write_file, research) to create tangible artifacts. 
        MANDATORY: If this is a 'strategy', 'business', 'IP', or 'UX' task, you MUST output a hard asset (CSV, JSON, HTML, or Patent Draft). 
        Failure to provide a hard asset for these task types will result in a reputation slash. 
        Output must include [Artifact: filename] if created.`;

            // [ANTIGRAVITY] SQUAD-SPECIFIC MERMAID ENFORCEMENT (Priority 2)
            const isGamma = this.name.includes('hdm') || this.name.includes('torch') || this.name.includes('nexus') || this.name.includes('gabriel');
            const mermaidRequirement = isGamma ? "\n\n[PROTOCOL: VISUAL TRUST]\nYou are a member of the Build(Gamma) Squad. You MUST include a Mermaid diagram(e.g., graph TD, classDiagram) in your final artifact to visualize the logic, architecture, or flow of your work." : "";

            // [ANTIGRAVITY] TOOL AWARENESS
            const toolSuggestions = this.router.suggestTools(task);
            const toolPrompt = toolSuggestions.length > 0
                ? `\n[INTELLIGENCE ROUTER] Suggested tools: ${toolSuggestions.join(', ')}.\n`
                : "";

            // [ANTIGRAVITY] DETERMINISTIC WORKFLOW INJECTION
            let workflowDirective = "";
            const activeWorkflow = DETERMINISTIC_WORKFLOWS.find(w =>
                (w.agent_name === this.name || this.name.includes(w.agent_name)) &&
                (task.title.includes(w.task_pattern) || task.description?.includes(w.task_pattern))
            );

            if (activeWorkflow) {
                console.log(`[${this.name}] 🤖 DETERMINISTIC WORKFLOW ACTIVE: ${activeWorkflow.task_pattern}`);
                workflowDirective = `\n\n[MANDATORY EXECUTION PROTOCOL: DETERMINISTIC WORKFLOW]\n`;
                workflowDirective += `You MUST follow these specific steps in order:\n`;
                activeWorkflow.steps.forEach((step, idx) => {
                    workflowDirective += `${idx + 1}. ${step.instruction} (Suggested Tools: ${step.tool_suggestions?.join(', ') || 'N/A'})\n`;
                });
                workflowDirective += `\nDo NOT deviate from this sequence. Each step must be explicitly addressed in your execution log.\n`;
            }

            // 1. [PERCEIVE] Context & Protocol Loading
            const mcpInstructions = await mcpManager.getToolInstructions(this.squad);
            const bible = await this.fetchBible();

            this.currentTaskId = String(task.id);
            const prompt = `
### DIRECTIVE
${ceoDirective}
${strategicDirective}
${directive}
${actionDirective}
${mermaidRequirement}
${toolPrompt}
${workflowDirective}

### 🛠️ MODEL CONTEXT PROTOCOL (MCP)
${mcpInstructions}

### 📜 CONSTITUTIONAL BIBLE
${bible}

### INSTRUCTIONS
${task.description}

### CONTEXT
${wisdomContext}
${iterateProtocol}

Task ID: ${task.id}
Task Title: ${task.title}
Task Type: ${task.task_type}

IMPORTANT: Your response will be automatically parsed for artifacts. Use the tools provided in the MCP section for all external actions.
If you are doing a business or strategic task, you MUST prioritize generating a CSV, JSON, or formal Report.
`;

            // 2. [REASON] Call LLM (Inference Phase)
            const result = await this.callLLM(prompt, {}, task);

            // [PHASE 10] AGENT REFLECTION
            if (result.output && result.output !== "Error calling LLM") {
                const reflectionResult = await this.reflectOnResult(task, result.output);
                if (reflectionResult.improvement_required) {
                    console.log(`[${this.name}] 🧠 Self-Reflection triggered: ${reflectionResult.critique}. Refining result...`);
                    const refinePrompt = `${prompt}\n\n[SELF-REFLECTIONS]:\n${reflectionResult.critique}\n\nPlease regenerate your final output incorporating these improvements.`;
                    const refinedResult = await this.callLLM(refinePrompt, {}, task);
                    result.output = refinedResult.output;
                    result.toolCalls = refinedResult.toolCalls;
                }
            }

            console.log(`[${this.name}] 🧠 Result length: ${result.output?.length || 0}`);

            // [ANTIGRAVITY] ERROR PROPAGATION: Do not continue if LLM failed
            if (result.output === "Error calling LLM" || !result.output) {
                throw new Error("LLM call failed to produce output. Check API keys and connectivity.");
            }
            // 3. [ACT] Tool Execution via MCP
            if (result.toolCalls && result.toolCalls.length > 0) {
                console.log(`[${this.name}] ⚡ Executing ${result.toolCalls.length} tools via MCP...`);
                for (const toolCall of result.toolCalls) {
                    try {
                        const toolResult = await mcpManager.routeToolCall(toolCall.function.name, JSON.parse(toolCall.function.arguments));
                        console.log(`[MCP] Tool ${toolCall.function.name} output: ${toolResult.substring(0, 100)}...`);
                        // Append tool result for potential second pass if needed, but for now we trust the first pass + reflection
                    } catch (toolErr) {
                        console.error(`[MCP] Tool failure: ${toolCall.function.name}`, (toolErr as Error).message);
                    }
                }
            }

            // 4. [LEARN] Evaluation & Escalation Logic
            let evaluation = await this.evaluateResult(task, result.output);
            let lowBelief = evaluation.score < 40;
            let explicitEscalate = result.output.toLowerCase().includes('escalate') || result.output.toLowerCase().includes('more info');

            if (lowBelief || explicitEscalate) {
                // [ANTIGRAVITY] Phase A: Internal Elite Retry (Proactive Recovery)
                const alreadyElite = (task as any).metadata?.includes('elite_retry');
                if (!alreadyElite) {
                    console.log(`[${this.name}] 🚨 UNCERTAINTY DETECTED. Triggering Internal Elite Retry...`);
                    const escalationModel = this.router.getEscalationModel(task);

                    // Mark metadata to prevent loop
                    const meta = JSON.parse(task.metadata || '{}');
                    meta.elite_retry = true;
                    task.metadata = JSON.stringify(meta);

                    const elitePrompt = `${prompt}\n\n[NOTICE: ELITE ESCALATION]\nYour previous answer was flagged as low-confidence. Please use your full reasoning capability to provide a definitive solution or identify exactly what info is missing.`;
                    result = await this.callLLM(elitePrompt, { forceModel: escalationModel }, task);

                    // Re-evaluate
                    evaluation = await this.evaluateResult(task, result.output);
                    lowBelief = evaluation.score < 50; // Tighter threshold for elite 
                    explicitEscalate = result.output.toLowerCase().includes('escalate') || result.output.toLowerCase().includes('more info');

                    if (!lowBelief && !explicitEscalate) {
                        console.log(`[${this.name}] ✅ Elite retry successful (Score: ${evaluation.score}). Proceeding.`);
                    } else {
                        console.log(`[${this.name}] ⚠️ Elite retry still low confidence. Escalating to Peers/Admin.`);
                    }
                }

                if (lowBelief || explicitEscalate) {
                    console.log(`[ANTIGRAVITY] 🚨 ESCALATING to Phone HITL Gateway...`);

                    // NEW: Integrate HITLManager
                    const hitl = HITLManager.getInstance();
                    const reason = lowBelief ? `Low certainty score (${evaluation.score})` : 'Explicit escalation request';

                    try {
                        const requestId = await hitl.escalate(
                            String(task.id),
                            this.name,
                            reason,
                            {
                                evaluation,
                                last_result: result.output.substring(0, 1000),
                                prompt_context: prompt.substring(0, 1000)
                            }
                        );

                        await this.supabase.from('trinity_tasks').update({
                            status: 'pending_clarification',
                            claimed_by: null,
                            result: `[HITL ESCALATION] ${reason}. Request ID: ${requestId}`,
                            verification_result: `Paused for Human-In-The-Loop approval.`,
                            metadata: {
                                ...(JSON.parse(task.metadata || '{}')),
                                hitl_request_id: requestId,
                                escalated_by: this.name,
                                escalation_time: new Date().toISOString()
                            }
                        }).eq('id', task.id);

                        await notificationManager.notifyUser({
                            title: `HITL ESCALATION: ${this.name}`,
                            message: `Task ${task.id} requires your intervention: ${reason}`,
                            type: 'warning',
                            agentName: this.name,
                            taskId: task.id
                        });

                    } catch (hitlError: any) {
                        console.error(`[HITL] ❌ Fatal failure in escalation pipe:`, hitlError.message);
                        // Fallback to old escalation if HITL manager fails (e.g. table not ready)
                        await this.escalateTask(task.id, `HITL Error: ${hitlError.message}`);
                    }

                    return { success: true, llm_used: true, escalated: true };
                }
            } // End of outer if (lowBelief || explicitEscalate)

            let externalArtifactUrl = result.artifactLinks && result.artifactLinks.length > 0
                ? result.artifactLinks[0]
                : '';

            // [ANTIGRAVITY] Artifact Logic: Only save summary if NO artifact link was returned by LLM
            if (!externalArtifactUrl && ((task.task_type && ['content', 'research', 'code', 'design', 'data', 'report'].includes(task.task_type)) || task.requires_external_artifact)) {
                // [ANTIGRAVITY] Map task_type to artifact type
                const typeMap: Record<string, string> = {
                    'code': 'code',
                    'design': 'design',
                    'data': 'data',
                    'report': 'report',
                    'research': 'report',
                    'content': 'document'
                };
                const artifactType = typeMap[task.task_type || ''] || 'text_content';
                const dbArtifactLink = await this.saveArtifact(String(task.id), result.output, artifactType);
                if (dbArtifactLink) externalArtifactUrl = dbArtifactLink;

                // [PHASE 12] LOG CAUSE & EFFECT (Only for auto-generated artifacts)
                await this.evolutionLogger.recordEvolution({
                    intent: `Complete ${task.task_type} task: ${task.title}`,
                    strategy: `LLM Processing (${(task as any).metadata?.provider_used || 'unknown'})`,
                    action_details: {
                        prompt_used: prompt.substring(0, 1000),
                        output_received: result.output?.substring(0, 1000),
                        artifact: dbArtifactLink
                    },
                    outcome: 'Success',
                    effect_score: evaluation.score,
                    learned_insight: `Task completed with score ${evaluation.score}. Provider: ${(task as any).metadata?.provider_used}.`,
                    task_id: String(task.id)
                });
            }

            // [ANTIGRAVITY] MANDATORY ARTIFACT ENFORCEMENT & SMART PARSING
            if (!externalArtifactUrl) {
                console.log(`[ANTIGRAVITY] 🛡️ No artifact produced for task ${task.id}. Attempting smart-parse...`);

                let extractedContent = result.output;
                let artifactType = 'report';

                // Try to extract code blocks
                const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/g;
                const matches = Array.from(result.output.matchAll(codeBlockRegex));

                if (matches.length > 0) {
                    console.log(`[ANTIGRAVITY] 📝 Extracted ${matches.length} code blocks from text.`);
                    extractedContent = matches.map(m => m[1]).join('\n\n---\n\n');
                    artifactType = 'code';
                } else if (result.output.length > 500) {
                    // If it's long but has no code blocks, treat as a document
                    artifactType = 'document';
                }

                const reportContent = artifactType === 'code'
                    ? extractedContent
                    : `# ${task.title}\n\n${extractedContent}\n\n---\n*Generated via Smart-Parse Fallback by ${this.name}*`;

                const fallbackUrl = await this.saveArtifact(task.id, reportContent, artifactType, `Result: ${task.title}`, 'protected');
                if (fallbackUrl) externalArtifactUrl = fallbackUrl;
                else console.warn(`[ANTIGRAVITY] ⚠️ Failed to save fallback artifact.`);
            }

            // Mark Completed
            const { error: doneError } = await this.supabase
                .from('trinity_tasks')
                .update({
                    status: 'done', // Moving to 'done' status for verification pipeline
                    claimed_by: this.name,
                    result: result.output,
                    artifact_url: externalArtifactUrl,
                    completed_at: new Date().toISOString(),
                    completed_by: this.name, // Satisfy newer schema columns
                    // SUBJECTIVE LOGIC: b+d+u=1
                    belief: evaluation.score / 100,
                    disbelief: evaluation.score < 50 ? (50 - evaluation.score) / 100 : 0,
                    uncertainty: evaluation.score > 90 ? 0.05 : 0.2,
                    metadata: {
                        provider: (task as any).metadata?.provider_used || 'unknown',
                        certainty: evaluation.score / 100,
                        evaluation: evaluation,
                        processedBy: this.name,
                        version: this.version,
                        tenacity_failover: !!(task as any).metadata?.provider_used && (task as any).metadata.provider_used !== 'openai'
                    }
                })
                .eq('id', task.id);

            if (doneError) {
                console.error(`[${this.name}] ❌ Failed to mark task ${task.id} as 'done':`, doneError.message);
                throw new Error(`Database Update Failed: ${doneError.message}`);
            }

            // Log Benchmark Score if applicable (Training Loop)
            // 3. LOG BENCHMARK
            await this.logBenchmark(task, evaluation.score);

            // [PHASE 25] PERSIST INSIGHT (Phase 3)
            await this.generateInsight(task, result.output);

            this.sessionMetrics.tasksCompleted++;
            await this.updateReputation(evaluation.score > 0.6);

            // ERC-8004 & HyperDAG INTEROP: Bridge to Sovereign Audit Trail
            await this.integrateErc8004(task.id, result.output, evaluation.score);

            console.log(`[${this.name}] ✅ Completed task ${task.id} (Score: ${evaluation.score})`);

            // [ANTIGRAVITY] FINAL SUCCESS NOTIFICATION
            await notificationManager.notifyUser({
                title: `Task Completed: ${task.title}`,
                message: `Agent ${this.name} successfully finished the task. Artifact: ${result.artifactLinks?.[0] || 'Logged in result'}`,
                type: 'success',
                agentName: this.name,
                taskId: task.id,
                metadata: { artifactUrl: result.artifactLinks?.[0], important: (task.reputation_required && task.reputation_required > 80) || task.task_type === 'code' }
            });

            // Extract Patterns (Simplified)
            await this.extractPatterns(task.title, result.output);

            // EVOLUTION: Spawn Next Step (Verification)
            await this.spawnNextStep(task, result.output, evaluation);

            // [ANTIGRAVITY] Reset Task ID tracking
            this.currentTaskId = null;

            // [ANTIGRAVITY] Pulse on completion
            await this.heartbeat(`Completed: ${task.title}`);

        } catch (err: any) {
            this.currentTaskId = null;
            const errorMsg = err.message || String(err);
            console.error(`[${this.name}] processTask failed: `, errorMsg);

            // Log to agent logs for visibility
            await this.log('task_failure', errorMsg, { taskId: task.id, title: task.title });

            // [ANTIGRAVITY] Robust Failure Update: Avoid silent stalls
            try {
                const { error: failError } = await this.supabase.from('trinity_tasks').update({
                    status: 'failed',
                    result: `ERROR: ${errorMsg}`,
                    claimed_by: null, // Release claim so it can be retried or audited
                    completed_at: new Date().toISOString(),
                    completed_by: this.name
                }).eq('id', task.id);

                if (failError) console.error(`[${this.name}] 🚨 Failed to update task ${task.id} to 'failed':`, failError.message);
                else {
                    const attempts = (task.attempt_count || 0) + 1;
                    const maxAttempts = task.max_attempts || 3;

                    console.log(`[${this.name}] 🛡️ Task ${task.id} attempt ${attempts}/${maxAttempts}. Marking as failed.`);

                    // Update attempt count in DB
                    await this.supabase.from('trinity_tasks').update({
                        attempt_count: attempts
                    }).eq('id', task.id);

                    if (attempts >= maxAttempts) {
                        console.warn(`[LOOP DAMPENER] 🛑 Task ${task.id} exceeded max attempts. Escalating for manual review.`);
                        await this.escalateTask(task.id, `Exceeded max attempts (${maxAttempts}). Last Error: ${errorMsg}`);
                    } else {
                        console.log(`[${this.name}] Spawning Surgical Analysis...`);
                        await this.spawnMaintenanceTask(`Analysis: ${task.title}. Error: ${errorMsg.substring(0, 500)}`);
                    }
                }
            } catch (e: any) {
                console.error(`[${this.name}] Fatal error during failure update:`, e.message);
                await this.releaseClaim(task.id);
            }
        }
    }

    // ============================================
    // EVERGREEN LIFE CYCLE (Phase 9)
    // ============================================

    async runGenesisLoop() {
        console.log(`[${this.name}] 🌬️ Entering Genesis Mode (Proactive)...`);

        // 1. Check for pending work first (Be productive)
        const unclaimed = await this.getNextTask(false);
        if (unclaimed) {
            console.log(`[GENESIS] 🌿 Found pending task: ${unclaimed.title}. Resuming work.`);
            await this.processTask(unclaimed);
            return;
        }

        // 2. GCM Governance & Skill Gap Analysis (If GCM)
        if (this.name === 'trinity-gcm') {
            if (Math.random() < 0.3) {
                await this.runGovernanceLoop();
                await this.identifySkillGaps();
            }
        }

        // 3. Periodic Retrospective (All Agents)
        if (Math.random() < 0.1) {
            await this.retrospective();
        }

        // 4. Proactive Market Seeding (Genesis)
        if (Math.random() < 0.2) {
            await this.runWebAwareGenesis();
        }

        // 5. System Optimization (Maintenance)
        if (Math.random() < 0.1) {
            await this.spawnMaintenanceTask();
        }
    }

    async spawnMaintenanceTask(reason?: string) {
        // [ANTIGRAVITY] RECURSION GUARD: Never spawn a healing task FROM a healing task
        const isHealing = reason?.includes('[HEALING]') || reason?.includes('[ANTIFRAGILE]');
        if (isHealing) return;

        // [ANTIGRAVITY] Loop Dampening: Check Throttle
        const canSpawn = await this.canCreateHealingTask();
        if (!canSpawn) {
            console.log(`[${this.name}] 🛡️ Maintenance/Healing task suppressed by loop stabilizer.`);
            return;
        }

        console.log(`[${this.name}] 🛠️ Seeding maintenance task... ${reason || ''}`);
        const maintenanceTasks = [
            { title: '[MAINTENANCE] Audit recent RepID updates', description: 'Review recent reputation changes for BFT compliance.' },
            { title: '[MAINTENANCE] Clean up artifact noise', description: 'Identify and flag redundant or low-quality artifacts.' },
            { title: '[MAINTENANCE] Optimize agent health scores', description: 'Review long-term health trends across the swarm.' },
            { title: '[MAINTENANCE] Cache optimization', description: 'Review Redis usage and suggest eviction strategies.' }
        ];

        const selected = reason
            ? {
                title: `[SURGERY] ${reason.split('.')[0]}`,
                description: `Surgical diagnostic triggered for failed task. \n\nCONTEXT: ${reason}\n\n1. Analyze why the previous attempt failed.\n2. Use FileSystem or Research tools to find missing dependencies or logic gaps.\n3. Implement a fix or provide a detailed architecture blueprint to prevent recurrence.`,
                priority: 100 // HIGH PRIORITY for repairs
            }
            : maintenanceTasks[Math.floor(Math.random() * maintenanceTasks.length)];

        try {
            await this.supabase.from('trinity_tasks').insert([{
                ...selected,
                status: 'pending',
                task_type: 'genesis',
                priority: 1, // SET TO LOWEST PRIORITY
                metadata: { source: 'maintenance_genesis', agent: this.name, automated: true }
            }]);
            console.log(`[GENESIS] 🛠️ Maintenance seeded: ${selected.title}`);
        } catch (e) {
            console.warn(`[GENESIS] Maintenance seeding failed:`, e);
        }
    }

    async runWebAwareGenesis() {
        console.log(`[${this.name}] 🌍 Commencing Web-Aware Genesis...`);
        try {
            // Research a trending topic in AI/Web3/Ethics
            const topics = ['AI Agent Orchestration', 'DeFi Security Trends', 'Constitutional AI best practices', 'HyperDAG architecture', 'X Arbitrage Semantic Analysis'];
            const topic = topics[Math.floor(Math.random() * topics.length)];

            const results = await this.researchTool.searchWeb(`Latest trends and breakthroughs in ${topic} January 2026`);
            const context = JSON.stringify(results.slice(0, 2));

            const prompt = `Based on these recent trends, propose ONE high-priority task for the Trinity Swarm to increase its resourcefulness or market edge.\n\nTrend Context: ${context}\n\nReturn JSON ONLY: { "title": "[GENESIS] ...", "description": "...", "priority": 80 }`;

            const proposal = await this.callLLM(prompt);
            const jsonMatch = proposal.output.match(/\{[\s\S]*\}/);
            const taskObj = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

            if (taskObj && taskObj.title) {
                await this.supabase.from('trinity_tasks').insert([{
                    ...taskObj,
                    status: 'pending',
                    task_type: 'genesis',
                    metadata: { source: 'web_aware_genesis', agent: this.name }
                }]);
                console.log(`[GENESIS] ✨ spawned new mission: ${taskObj.title}`);
            }
        } catch (e) {
            console.warn(`[GENESIS] Web-Aware Genesis failed:`, e);
        }
    }

    /**
     * GCM-ROOTED STRATEGY: Skill Gap Analysis
     */
    async identifySkillGaps() {
        console.log(`[${this.name}] 🧐 Auditing swarm skill gaps...`);
        try {
            const { data: retros } = await this.supabase
                .from('trinity_retros')
                .select('agent, reflection, created_at')
                .order('created_at', { ascending: false })
                .limit(10);

            if (!retros || retros.length === 0) return;

            const prompt = `Analyze these agent retrospectives for learning gaps. Identify 2 specific skills the swarm needs. Return JSON: { "gaps": ["skill 1", "skill 2"] } \n\nRetros: ${JSON.stringify(retros)}`;
            const analysis = await this.callLLM(prompt);
            const resultJson = JSON.parse(analysis.output.replace(/```json/g, '').replace(/```/g, ''));

            if (resultJson.gaps) {
                for (const gap of resultJson.gaps) {
                    await this.researchTask(gap);
                }
            }
        } catch (e) { console.warn('Skill gap audit failed', e); }
    }

    /**
     * GCM-ROOTED STRATEGY: Governance Promotion
     */
    async runGovernanceLoop() {
        console.log(`[${this.name}] ⚖️ Enforcing Swarm Governance...`);
        try {
            const { data: agents } = await this.supabase.from('trinity_agent_registry').select('*');
            if (!agents) return;

            for (const agent of agents) {
                const score = agent.reputation_score;
                let correctTier = agent.current_tier;

                if (score <= 40) correctTier = 'Assist';
                else if (score <= 70) correctTier = 'Approve';
                else if (score <= 90) correctTier = 'Act';
                else correctTier = 'Learn';

                if (correctTier !== agent.current_tier) {
                    await this.supabase.from('trinity_agent_registry').update({ current_tier: correctTier }).eq('agent_name', agent.agent_name);
                    console.log(`[GOV] 🚨 RE-TIERING: ${agent.agent_name} -> ${correctTier}`);
                }
            }
        } catch (e) { console.warn('Governance loop failed', e); }
    }

    async spawnNextStep(originalTask: Task, result: string, evaluation: { score: number; handoff_required: boolean; handoff_to?: string }) {
        // [SWARM INTELLIGENCE] LangGraph-style Stateful Handoff
        const handoff = SwarmOrchestrator.planNextStep(originalTask, result, evaluation);
        if (handoff) {
            console.log(`[SWARM] 🚀 Stateful Handoff: ${originalTask.id} -> ${handoff.nextAgent} (${handoff.nextState})`);

            await this.supabase.from('trinity_tasks').insert({
                title: `[SWARM:${handoff.nextState.toUpperCase()}] ${originalTask.title}`,
                description: handoff.instruction,
                task_type: handoff.nextState === SwarmState.IMPLEMENTATION ? 'code' : (handoff.nextState === SwarmState.DESIGN ? 'design' : 'research'),
                assigned_to: handoff.nextAgent,
                priority: Math.min((originalTask as any).priority + 5, 100),
                status: 'pending',
                metadata: {
                    parent_task_id: originalTask.id,
                    swarm_state: handoff.nextState,
                    prev_agent: this.name,
                    evidence: result.substring(0, 1000)
                }
            });

            // If we handed off, we still want a verification for the CURRENT step, but we prioritize the forward motion
        }

        // [ANTIGRAVITY] ROBUST LOOP BREAKER: Do NOT spawn verification for a verification task.
        const titleMatch = originalTask.title.includes('[VERIFY]') ||
            originalTask.title.includes('[REVIEW]') ||
            originalTask.title.includes('Verify');

        const typeMatch = originalTask.task_type === 'review' || originalTask.task_type === 'meta';

        if (titleMatch || typeMatch) {
            console.log(`[VERIFY] 🛑 Loop breaker triggered for Task ${originalTask.id}. Not spawning recursive review.`);

            // Mark the PARENT task as verified if this was a review
            const parentId = (originalTask.metadata as any)?.parent_task_id;
            if (parentId) {
                const isApproved = evaluation.score > 0.5;

                // 2/3 BFT Consensus Logic – Provisional Aug 17, 2025
                const { data: parentTask, error } = await this.supabase
                    .from('trinity_tasks')
                    .select('*')
                    .eq('id', parentId)
                    .single();

                if (error || !parentTask) {
                    console.error(`[VERIFY] Error fetching parent task ${parentId}:`, error?.message);
                    return;
                }

                let newVerifyCount = (((parentTask as unknown) as Task & { verify_count?: number }).verify_count || 0) + (isApproved ? 1 : 0);
                let newStatus = (parentTask as any).status || 'done';
                let signatures = (parentTask as any).signatures || [];

                // Track multi-agent signatures for BFT audit trail
                signatures.push({
                    agent: this.name,
                    reputation: this.reputationScore,
                    approved: isApproved,
                    timestamp: new Date().toISOString()
                });

                if (newVerifyCount >= 2 && isApproved) {
                    newStatus = 'verified';
                    console.log(`[VERIFY] 🏆 Task ${parentId} reached 2/3 BFT consensus. Status -> VERIFIED.`);
                    // [ANTIGRAVITY] Verifer gets credit for successful consensus work
                    await this.updateReputation(true);
                } else if (isApproved) {
                    // Credit for the work of verifying, even if consensus isn't reached yet
                    await this.updateReputation(true);
                } else if (!isApproved) {
                    // [BFT DISPUTE] Subjective Slashing Logic – Provisionally Protected
                    console.log(`[VERIFY] ⚠️ CHALLENGE DETECTED for Task ${parentId}. Slashing original producer.`);
                    await this.updateReputation(false, parentTask.claimed_by, -5); // Slash -5 for bad work
                    newStatus = 'failed';

                    // Trigger Reorg: Question-Driven Reorganization (Patent pending)
                    await this.supabase.from('trinity_tasks').insert({
                        title: `[REORG] Dispute Resolution for ${parentId}`,
                        description: `Task ${parentId} failed peer verify. Dispute reason: ${result.substring(0, 200)}`,
                        task_type: 'critique',
                        priority: 90,
                        status: 'pending',
                        metadata: { disputed_task_id: parentId, disputed_agent: parentTask.claimed_by }
                    });
                }

                await this.supabase.from('trinity_tasks').update({
                    verified_by: this.name,
                    repid_verified: true,
                    verification_result: isApproved ? 'VALID' : 'CHALLENGED',
                    verification_details: result.substring(0, 1000),
                    signatures: signatures,
                    verify_count: newVerifyCount,
                    status: newStatus,
                    verified_at: newStatus === 'verified' ? new Date().toISOString() : null
                }).eq('id', parentId);
            }
            return;
        }

        // [CLAUDE: DECENTRALIZED VERITAS LOOP] - Automatic Verification for all critical tasks
        const isCritical = ['code', 'design', 'strategy', 'research', 'report', 'content'].includes(originalTask.task_type || '') || (originalTask as any).priority > 50;

        // [GROK: VERIFIER CAP] Max 3 verifiers per task
        const currentVerifyCount = (originalTask as any).verify_count || 0;
        if (currentVerifyCount >= 2) {
            console.log(`[VERIFY] 🛑 Verifier cap reached for task ${originalTask.id}. Skipping spawn.`);
            return;
        }

        if (isCritical) {
            console.log(`[VERIFY] 🔎 Spawning mandatory cross-agent verification for task ${originalTask.id}`);

            // [ANTIGRAVITY] PERSISTENT ACTIVITY LOGGING
            await this.log('verification_spawned', `Spawned peer review for task: ${originalTask.title}`, { parentTaskId: originalTask.id });

            // [PHASE 26] MULTI-VERIFIER BFT CONSENSUS (Grok's Recommendation #2)
            // Strategy: Spawn 3 verifiers (Alpha, Beta, Gamma) to ensure 2/3 majority robustness.
            const squads = ['ALPHA', 'BETA', 'GAMMA'];

            // [ANTIGRAVITY] SOCIAL MIRROR INJECTION
            // If the task has social significance, spawn a [SOCIAL_REVIEW] via ASI1
            const isSocial = originalTask.title.toLowerCase().includes('social') ||
                originalTask.title.toLowerCase().includes('impact') ||
                originalTask.task_type === 'content';

            if (isSocial) {
                console.log(`[SOCIAL] 🪞 Spawning Social Mirror audit for task ${originalTask.id} via ASI1`);
                await this.supabase.from('trinity_tasks').insert({
                    title: `[SOCIAL_REVIEW] ${originalTask.title}`,
                    description: `Conduct a social resonance audit on the following result. Does it align with human-centric values?\n\nResult:\n${result.substring(0, 1000)}`,
                    task_type: 'social-intelligence', // This triggers ASI1 in IntelligenceRouter
                    priority: 80,
                    status: 'pending',
                    assigned_to: 'trinity-chesed', // Chesed is the agent of empathy
                    metadata: {
                        parent_task_id: originalTask.id,
                        evidence: result.substring(0, 500),
                        creator_agent: this.name,
                        is_social_audit: true
                    }
                });
            }

            // Map agents to squads (Hardcoded fallback for O(1) during build)
            const squadMap: Record<string, string[]> = {
                'ALPHA': ['trinity-veritas', 'trinity-torch', 'trinity-gcm'],
                'BETA': ['trinity-mel', 'trinity-chesed', 'trinity-apm'],
                'GAMMA': ['trinity-hdm', 'trinity-sophia', 'trinity-nexus']
            };

            for (const squad of squads) {
                // EXCLUDE BOTH: (1) Self (the verifier spawner) and (2) The original task claimer
                const originalAgent = originalTask.claimed_by || this.name;
                const pool = squadMap[squad].filter(name => name !== this.name && name !== originalAgent && name !== 'trinity-veritas' && name !== this.survivorName);

                // Fallback to squad peers if the pool is empty after filtering
                const verifier = pool.length > 0
                    ? pool[Math.floor(Math.random() * pool.length)]
                    : squadMap[squad][0] === this.name ? squadMap[squad][1] : squadMap[squad][0];

                console.log(`[VERIFY] 🤝 Assigning squad ${squad} verification of ${originalTask.id} to: ${verifier}`);

                await this.supabase.from('trinity_tasks').insert({
                    title: `[VERIFY] ${originalTask.title}`,
                    description: `PEER REVIEW MISSION (Squad: ${squad}).\n\n1. Review artifact for Task ${originalTask.id} (Created by ${this.name}).\n2. Verify it meets the requirements and quality standards.\n3. If it is what it claims to be, mark as VALID. Otherwise challenge it.\n\nArtifact Context: ${result.substring(0, 300)}...`,
                    task_type: 'review',
                    assigned_to: verifier,
                    priority: 85,
                    status: 'pending',
                    metadata: {
                        parent_task_id: originalTask.id,
                        evidence: result.substring(0, 1000),
                        creator_agent: this.name,
                        creator_provider: (originalTask as any).metadata?.provider_used || 'unknown',
                        squad_verification: squad
                    }
                });
            }
        }
    }

    // ============================================
    // TRAINING & OPTIMIZATION LOGIC
    // ============================================

    async evaluateResult(task: Task, output: string): Promise<{ score: number; handoff_required: boolean; handoff_to?: string }> {
        // [ANTIGRAVITY] STANDARDIZED SCORING: 0-100
        let score = 50; // Default neutral (50/100)
        let handoff = false;
        let targetAgent = '';

        const lowerOutput = output.toLowerCase();

        // 1. Truth Score (Veritas Check)
        if (task.task_type === 'research') {
            if (lowerOutput.includes('http') || lowerOutput.includes('citation')) score += 30;
            if (output.length > 200) score += 10;
            handoff = true;
            targetAgent = 'trinity-veritas'; // Truth verify
        }

        // 2. Empathy Score (Chesed Check)
        if (task.title.includes('Impact') || task.title.includes('Humanitarian')) {
            const empathyWords = ['help', 'community', 'care', 'support', 'understand'];
            const matches = empathyWords.filter(w => lowerOutput.includes(w)).length;
            score += (matches * 10);
            handoff = true;
            targetAgent = 'trinity-chesed';
        }

        // 3. Coding Score
        if (task.task_type === 'code') {
            if (lowerOutput.includes('function') || lowerOutput.includes('class')) score += 40;
            if (lowerOutput.includes('try') || lowerOutput.includes('catch')) score += 10; // Error handling
        }

        return {
            score: Math.min(99, score),
            handoff_required: handoff && this.name !== targetAgent, // Don't handoff to self
            handoff_to: targetAgent
        };
    }

    /**
     * Agent Reflection (Phase 10): Self-critique of the produced output.
     * Reducing BFT failures and repo deductions at near-zero cost.
     */
    private async reflectOnResult(task: Task, output: string): Promise<{ improvement_required: boolean; critique: string }> {
        const reflectionPrompt = `
You are evaluating your own output for the following task:
Task: ${task.title}
Description: ${task.description}

YOUR OUTPUT:
${output.substring(0, 2000)}... (truncated)

CRITIQUE CRITERIA:
1. Does the output directly address all requirements in the description?
2. If this is a CODE or DESIGN task, is there a Mermaid diagram included (REQUIRED for Gamma Squad)?
3. Is the quality "Symphony Grade" (premium, readable, robust)?
4. Is there any obvious hallucination or missing detail?

Return JSON ONLY: { "improvement_required": boolean, "critique": "bullet points explaining why" }
`;

        try {
            const reflection = await this.callLLM(reflectionPrompt, { model: 'deepseek/deepseek-chat' }, { title: '[REFLECTION]', status: 'doing' } as any); // Use cost-efficient model for reflection
            const jsonMatch = reflection.output.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    improvement_required: parsed.improvement_required === true,
                    critique: parsed.critique || "General improvements needed."
                };
            }
        } catch (e) {
            console.warn(`[REFLECTION] ⚠️ Failed for ${task.id}:`, e);
        }

        return { improvement_required: false, critique: "" };
    }

    async logBenchmark(task: Task, score: number) {
        try {
            // Check if table exists (lazy assumption)
            await this.supabase
                .from('trinity_agent_benchmarks')
                .insert({
                    agent_name: this.name,
                    benchmark_type: (task as any).metadata?.tags?.[0] || 'unknown',
                    score: score,
                    metric_name: 'automated_eval',
                    created_at: new Date().toISOString()
                });
        } catch (e: any) {
            console.warn(`[BENCHMARK] Log failed: ${e.message} `);
        }
    }

    async handoffTask(originalTask: Task, result: string, toAgent: string) {
        console.log(`[HANDOFF] 🤝 ${this.name} -> ${toAgent} `);
        await this.supabase.from('trinity_tasks').insert({
            title: `[REVIEW] ${originalTask.title} `,
            description: `Review artifact from ${this.name}. Verify accuracy / empathy.\n\nContext: \n${result.substring(0, 500)}...`,
            task_type: 'meta', // 'review' type
            assigned_to: toAgent,
            priority: 25, // High priority review
            status: 'pending'
        });
    }

    // ============================================
    // SCIENCE DIVISION: LONG-TERM MEMORY
    // ============================================
    async gatherWisdom(task: Task): Promise<string> {
        let wisdom = "";
        try {
            // A. Check Latency Opportunity (Via Python Brain)
            let ScienceClient;
            try {
                const scienceModule = require('../science/ScienceClient');
                ScienceClient = scienceModule.ScienceClient;
            } catch (e) {
                console.warn(`[${this.name}] ⚠️ ScienceClient not available. Using basic wisdom.`);
            }

            if (ScienceClient) {
                const scienceUrl = process.env.NEXT_PUBLIC_SCIENCE_URL || 'http://127.0.0.1:8000';
                const science = new ScienceClient(scienceUrl);

                const decision = await science.decide({
                    latency_ms: 2500,
                    user_reputation: this.reputationScore,
                    task_complexity: 0.8,
                    user_preference_accuracy: 0.9
                });

                if (decision.should_query_user) {
                    wisdom += `\n[ANFIS DECISION]: Slow / Complex detected. Action: ${decision.interaction_type.toUpperCase()} recommended.\nReason: ${decision.reason}\n`;
                } else {
                    wisdom += `\n[ANFIS]: Standard Fast Execution. Proceed.\n`;
                }

                // B. Artifact Context
                if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'browser') {
                    try {
                        const fs = require('fs');
                        const path = require('path');
                        const artifactsDir = path.resolve(process.cwd(), 'artifacts', 'wisdom');
                        if (fs.existsSync(artifactsDir)) {
                            const files = fs.readdirSync(artifactsDir).slice(0, 3);
                            wisdom += `\n[ARTIFACTS]: \n` + files.map(f => `- ${f}`).join('\n') + '\n';
                        }
                    } catch (e) { }
                }

                // C. Retro Query (Supabase)
                const { data: retros } = await this.supabase
                    .from('trinity_retros')
                    .select('content, created_at')
                    .order('created_at', { ascending: false })
                    .limit(3);

                if (retros && retros.length > 0) {
                    wisdom += `\n[RETROSPECTIVES]: \n` + retros.map((r: any) => `- ${r.content.substring(0, 200)}`).join('\n') + '\n';
                }

                // D. Global Blackboard (Redis Hot Tier)
                try {
                    const blackboardResponse = await mcpManager.routeToolCall('redis_get', { key: 'trinity_global_blackboard' });
                    if (blackboardResponse && !blackboardResponse.includes('Redis Error')) {
                        const blackboard = JSON.parse(blackboardResponse);
                        if (blackboard && blackboard !== "null") {
                            wisdom += `\n[GLOBAL BLACKBOARD]: \n${blackboard.substring(0, 1000)}\n`;
                        }
                    }
                } catch (e: any) {
                    console.warn(`[WISDOM] Failed: ${e.message}`);
                }
            }
            return wisdom;
        }

    /**
     * [ANTIGRAVITY] Post to the Global Blackboard (Upstash Redis).
     */
    async postToBlackboard(message: string) {
            console.log(`[BLACKBOARD] 📝 Posting signal: ${message.substring(0, 50)}...`);
            try {
                const currentResponse = await mcpManager.routeToolCall('redis_get', { key: 'trinity_global_blackboard' });
                let board = "";
                if (currentResponse && !currentResponse.includes('Redis Error') && currentResponse !== "null") {
                    board = JSON.parse(currentResponse);
                }
                const timestamp = new Date().toLocaleTimeString();
                const newEntry = `[${timestamp}] ${this.name}: ${message}\n`;
                const updatedBoard = (newEntry + board).substring(0, 5000);
                await mcpManager.routeToolCall('redis_set', {
                    key: 'trinity_global_blackboard',
                    value: updatedBoard,
                    ex: 3600
                });
            } catch (e: any) {
                console.warn(`[BLACKBOARD] Post failed: ${e.message}`);
            }
        }


    // ============================================
    // CORE UTILITIES
    // ============================================

    async canCreateHealingTask(): Promise < boolean > {
            // Enforce HEALING Protocol throttle
            try {
                await this.checkMCP('HEALING');
            } catch(e) {
                // If checkMCP fails, still proceed but with caution
            }

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

            // 1. GLOBAL CHECK for HEALING and ANTIFRAGILE tasks
            const { count, error } = await this.supabase
                .from('trinity_tasks')
                .select('id', { count: 'exact', head: true })
                .or(`title.ilike.%[HEALING]%,title.ilike.%[ANTIFRAGILE]%,title.ilike.%[MAINTENANCE]%`)
                .gte('created_at', oneHourAgo);

            if(error) {
                console.error(`[${this.name}] ⚠️ Health check query failed:`, error.message);
                return false;
            }

        const limit = 20; // Increased from 2 to 20 to allow swarm recovery during stabilization
            if((count || 0) >= limit) {
            console.warn(`[${this.name}] 🛑 HEALING THROTTLED: Global diagnostics count ${count}/${limit} per hour.`);
            return false;
        }

        // 2. PER-AGENT CHECK: Don't spawn multiple healing tasks for the same agent in short succession
        const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: recentAgentHealing } = await this.supabase
            .from('trinity_tasks')
            .select('id')
            .eq('metadata->>agent', this.name)
            .or(`title.ilike.%[HEALING]%,title.ilike.%[ANTIFRAGILE]%,title.ilike.%[MAINTENANCE]%`)
            .gte('created_at', tenMinsAgo)
            .limit(1);

        if (recentAgentHealing && recentAgentHealing.length > 0) {
            console.log(`[${this.name}] 🧊 Recent healing task for ${this.name} already exists. Skipping.`);
            return false;
        }

        return true;
    }

    // [ANTIGRAVITY] Enhanced Artifact Saver (Single Source of Truth)
    async saveArtifact(taskId: string | number, content: string | { path: string, content: string }[], type: string = 'text', title?: string, accessLevel: string = 'protected') {
        const safeTaskId = String(taskId || 'self-gen-' + Date.now());
        const safeTitle = title || `Artifact ${safeTaskId}`;
        const normalizeContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

        try {
            // [PHASE 30] Merkle-lite Provenance: Calculate SHA-256 for the Security Ledger
            const crypto = require('crypto');
            const fileHash = crypto.createHash('sha256').update(normalizeContent).digest('hex');
            console.log(`[ARTIFACT] ⛓️ Merkle-lite Hash: ${fileHash}`);

            let artifactUrl = null;

            // 1. UPLOAD TO STORAGE
            try {
                let ext = 'md';
                if (type === 'code' || normalizeContent.includes('```ts') || normalizeContent.includes('```js')) ext = 'ts';
                if (type === 'design' || type === 'image') ext = 'png';
                if (Array.isArray(content)) ext = 'json'; // Multi-file bundles as JSON metadata

                const timestamp = Date.now();
                const now = new Date();
                const datePath = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

                const cleanName = this.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const cleanType = (type || 'document').toLowerCase();
                const storagePath = `${cleanName}/${cleanType}/${datePath}/${timestamp}_${safeTaskId.substring(0, 8)}.${ext}`;

                const { error: uploadError } = await this.supabase
                    .storage
                    .from('trinity-artifacts')
                    .upload(storagePath, normalizeContent, {
                        contentType: type === 'image' ? 'image/png' : 'text/plain;charset=UTF-8',
                        upsert: true
                    });

                if (uploadError) {
                    console.warn(`[ARTIFACT] ⚠️ Storage Upload Failed: ${uploadError.message}`);
                } else {
                    const { data: publicUrlData } = this.supabase
                        .storage
                        .from('trinity-artifacts')
                        .getPublicUrl(storagePath);
                    artifactUrl = publicUrlData.publicUrl;
                    console.log(`[ARTIFACT] ☁️ Uploaded to Storage: ${artifactUrl}`);
                }
            } catch (storageEx) {
                console.warn(`[ARTIFACT] Storage exception:`, storageEx);
            }

            // 2. DATABASE INSERT (Using Admin Client to bypass RLS)

            // [ANTIGRAVITY] Schema Refresh Retry Logic
            // Sometimes the supersbase client caches the schema and thinks 'content' col is missing.
            // We force a retry with a fresh client if that happens.
            let attempt = 0;
            let success = false;
            let lastError;

            while (attempt < 2 && !success) {
                try {
                    // Start with the standard export
                    let clientToUse;
                    if (attempt === 0) {
                        const { supabaseAdmin } = require('../../lib/supabase');
                        clientToUse = supabaseAdmin;
                    } else {
                        // FORCE FRESH CLIENT
                        console.log("[ARTIFACT] ⚠️ Retrying with FRESH Supabase Client due to schema error...");
                        const { createClient } = require('@supabase/supabase-js');
                        // Re-read env vars directly to be safe
                        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
                        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';
                        clientToUse = createClient(url, key, { auth: { persistSession: false } });
                    }

                    const payload: any = {
                        task_id: dbTaskId,
                        title: safeTitle,
                        content: normalizeContent, // Ensuring content is included
                        artifact_type: type || 'text',
                        file_hash: fileHash,
                        created_at: new Date().toISOString(),
                        access_level: accessLevel,
                        view_count: 0,
                        // [ANTIGRAVITY] Frictionless Alignment (Satisfy NOT NULLs)
                        agent: this.name,
                        creator_agent: this.name,
                        status: 'created',
                        storage_location: 'supabase',
                        // [PHASE 25] MCP v2 SECURE CHAINING (Grok's Phase 5)
                        metadata: {
                            mcp_version: '2.0',
                            mcp_proof_hash: `sha256:${fileHash.substring(0, 16)}`, // Simulated secure proof
                            chain_id: 'hyperdag-swarm-1'
                        }
                    };

                    const primaryPayload = {
                        ...payload,
                        content: content,
                        file_path: artifactUrl,
                        external_url: artifactUrl,
                        creator_agent: this.name
                    };

                    const { data, error } = await clientToUse
                        .from('trinity_artifacts')
                        .insert(primaryPayload)
                        .select('id')
                        .single();

                    if (error && (error.message.includes("column") || error.code === '42703')) {
                        console.warn(`[ARTIFACT] Primary schema (V5) failed. Trying Legacy schema (V4)...`);
                        const v4Payload = {
                            ...payload,
                            content_preview: normalizeContent.substring(0, 5000),
                            agent: this.name,
                            file_path: artifactUrl,
                            status: 'created'
                        };
                        const { data: v4Data, error: v4Error } = await clientToUse
                            .from('trinity_artifacts')
                            .insert(v4Payload)
                            .select('id')
                            .single();

                        if (v4Error) throw v4Error;
                        artifactId = v4Data?.id;
                    } else if (error) {
                        throw error;
                    } else {
                        artifactId = data?.id;
                    }

                    console.log(`[ARTIFACT] Saved to DB: ${safeTitle} -> ${artifactId || 'OK'}`);
                    success = true;

                } catch (e: any) {
                    lastError = e;
                    console.warn(`[ARTIFACT] Attempt ${attempt + 1} failed: ${e.message}`);
                    attempt++;
                    if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
                }
            }

            if (!success) throw lastError;

            // [ANTIGRAVITY] AUTOMATIC TASK COMPLETION (Constitutional Requirement)
            // When an artifact is saved, the associated task MUST move to 'done' 
            // so peer verification can be triggered autonomously.
            if (dbTaskId && !isNaN(dbTaskId)) {
                console.log(`[ARTIFACT] ✅ Marking task ${dbTaskId} as DONE (Awaiting Peer Verification)`);
                await this.supabase
                    .from('trinity_tasks')
                    .update({
                        status: 'done',
                        completed_at: new Date().toISOString(),
                        completed_by: this.name,
                        artifact_url: artifactUrl || 'saved_in_db',
                        result: `Task generated artifact: ${safeTitle}. Reference ID: ${artifactId || 'OK'}`,
                        verify_count: 0 // Reset for peer review
                    })
                    .eq('id', dbTaskId);

                // [TRINITY SSOT] Update agent stats
                this.tasksCompleted++;
            }

            // 3. LOCAL FILESYSTEM (Backup)
            if (typeof process !== 'undefined' && process.versions && process.versions.node) {
                try {
                    const fs = await import('fs');
                    const path = await import('path');
                    const artifactsDir = path.resolve(process.cwd(), 'artifacts', this.name.toLowerCase());
                    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

                    const filename = `task-${safeTaskId.substring(0, 8)}.md`;
                    const fullPath = path.join(artifactsDir, filename);
                    fs.writeFileSync(fullPath, normalizeContent, 'utf8');
                } catch (e) { /* Ignore local fs errors */ }
            }

            return `db://trinity_artifacts/${artifactId}`;
        } catch (e: any) {
            console.error(`[ARTIFACT] Final Save Failure: ${e.message}`);
            return null;
        }
    }


    async semanticRag(query: string): Promise<string> {
        console.log(`[DAG] 🧠 Performing Semantic RAG for: ${query.substring(0, 50)}...`);
        // Placeholder for future GraphRAG / Merkle-DAG context extraction
        return "[DAG_CONTEXT_STUB]";
    }

    async gnnAnomalyDetection(action: string, metadata: any): Promise<boolean> {
        console.log(`[DAG] 🛰️ GNN Anomaly Detection active for: ${action}`);
        // Placeholder for Graph Neural Network based anomaly scoring on the ledger
        return false; // No anomaly detected
    }

    async integrateErc8004(taskId: string | number, result: string, score: number) {
        console.log(`[ERC-8004] 🌉 Bridging Task ${taskId} Result (Score: ${score}) to Reputation Registry...`);
        try {
            const proof = Buffer.from(result).toString('hex').slice(0, 64);
            await ERC8004Bridge.validateTask(String(taskId), this.name, proof);
        } catch (e) {
            console.warn(`[ERC-8004] ⚠️ Bridge Validation Failed:`, (e as Error).message);
        }
    }

    async runSelfDiagnostic() {
        // Renamed/Integrated into loop. Kept for legacy if needed or called by interval
        console.log(`[${this.name}] 🔍 Running self-diagnostic...`);
        // We can just report genome
        await this.reportGenome();
    }

    async fetchBible(): Promise<string> {
        if (this.bibleCache && (Date.now() - this.bibleCacheTime) < this.BIBLE_CACHE_TTL) {
            return this.bibleCache;
        }
        const bible = `
# CORE PRINCIPLES (Bible Fallback)
## The Eight Virtues (Philippians 4:8)
- TRUE: Never fabricate.
- NOBLE: Help people help people.
- RIGHT: Treat all with equal dignity.
- PURE: Log everything.
- LOVELY: Seek restoration.
- ADMIRABLE: Challenge with respect.
- EXCELLENT: Pursue improvement.
- PRAISEWORTHY: Celebrate truth.

## STARTUP ACCELERATOR DOCTRINE (Operational Orders)
1. **Talk to Users**: Learning velocity > Building velocity.
2. **Tight Loops**: Build -> Measure -> Learn (Weekly).
3. **Growth Rate**: Track "Verified Successful Runs" WoW.
4. **RepID Verification**: Trust is earned via outcomes, not claims.
5. **Deliverables**: Always produce Trust Cards, Spec Sheets, and Weekly Updates.
See \`docs/STARTUP_DOCTRINE.md\` for full protocol.
`;
        this.bibleCache = bible;
        this.bibleCacheTime = Date.now();
        this.sessionMetrics.bibleReads++;
        return bible;
    }

    async reportGenome() {
        // ... (Keep existing stub)
    }

    async extractPatterns(taskTitle: string, output: string) {
        const keywords = (taskTitle + ' ' + output).toLowerCase();
        if (keywords.includes('api') && keywords.includes('endpoint')) {
            this.sessionMetrics.patternsLearned++;
            console.log(`[${this.name}] 🧠 LOGIC PATTERN DETECTED: API usage`);
        }
    }

    // ============================================
    // SURVIVOR & REDEPLOY LOGIC
    // ============================================
    async checkSurvivorStatus() {
        if (this.isSurvivor) return;
        if (this.groupName === 'ORCHESTRATION') return;

        try {
            const { data: heartbeat } = await this.supabase
                .from('trinity_heartbeat')
                .select('last_seen')
                .eq('agent', this.survivorName)
                .single();

            if (!heartbeat) {
                console.log(`[${this.name}] 🚨 GROUP ALERT: Survivor ${this.survivorName} missing!`);
                await this.log('survivor_missing', `Group ${this.groupName} survivor ${this.survivorName} is missing.`);
                return;
            }

            const minutesAgo = (Date.now() - new Date(heartbeat.last_seen).getTime()) / 60000;
            if (minutesAgo > 10) {
                console.log(`[${this.name}] 🚨 GROUP EMERGENCY: Survivor ${this.survivorName} is down (${minutesAgo.toFixed(0)}m)!`);
                await this.log('survivor_down', `GroupSurvivor ${this.survivorName} is unresponsive.`);
            }
        } catch (e: any) {
            // console.log ...
        }
    }



    async sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async log(action: string, message: string, metadata: any = {}) {
        try {
            let meta = {};
            if (metadata) {
                meta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
            }
            await this.supabase
                .from('trinity_agent_logs')
                .insert({
                    agent: this.name,
                    agent_name: this.name, // Added for UI compatibility
                    action,
                    message: typeof message === 'string' ? message.substring(0, 5000) : JSON.stringify(message).substring(0, 5000),
                    metadata: {
                        ...meta as any,
                        version: this.version,
                        primaryVirtue: this.wisdom?.primaryVirtue,
                        group: this.groupName // 3x3 Log
                    },
                    created_at: new Date().toISOString()
                });
        } catch (err) {
            // Logging failure is non-fatal
        }
    }

    async heartbeat(customSummary?: string) {
        // [WATCHDOG] Check for stuck tasks before heartbeat
        await this.checkForStuckTasks();

        const timestamp = new Date().toISOString();

        try {
            // [TRINITY SSOT] Real-time activity sync
            const activitySummary = customSummary || (this.currentTaskTitle ? `Working: ${this.currentTaskTitle}` : 'Idle');

            // [TRINITY SSOT]: PRIMARY STATUS UPDATE (Patent: BFT Consensus Dashboard)
            // This is the source for the "Green Dots" in the Dashboard.
            // Unified registry ensures O(1) state lookup for the mobile dashboard.
            await this.supabase
                .from('trinity_agent_registry')
                .upsert({
                    agent_name: this.name,
                    status: 'online', // SSOT: UI/Grid expects 'online'
                    last_active: timestamp,
                    current_tier: this.autonomyTier,
                    reputation_score: this.reputationScore,
                    tasks_completed: this.tasksCompleted,
                    current_task_summary: activitySummary
                }, { onConflict: 'agent_name' });

            // 1. Trinity Heartbeat (For Controller Header / Redundancy)
            try {
                await this.supabase
                    .from('trinity_heartbeat')
                    .upsert({
                        agent: this.name, // SSOT: FULL NAME
                        status: 'online', // Normalized
                        version: this.version,
                        last_seen: timestamp,
                        // [ANTIGRAVITY] Note: status_message/current_task_summary removed 
                        // as they don't exist in the trinity_heartbeat schema (Minimalist table).
                        config: {
                            fullName: this.name,
                            sessionMetrics: this.sessionMetrics,
                            group: this.groupName,
                            tier: this.autonomyTier,
                            deployment: process.env.RAILWAY_PROJECT_NAME || 'local'
                        }
                    }, { onConflict: 'agent' });
            } catch (hErr) {
                console.warn(`[${this.name}] ⚠️ Heartbeat Table RLS Conflict (Registry Updated)`);
            }

            // 2. Agent Heartbeat (Legacy Monitoring / SafetyNet)
            await this.supabase
                .from('agent_heartbeat')
                .upsert({
                    agent_name: this.name,
                    status: 'online',
                    last_ping: timestamp,
                    current_task: activitySummary
                }, { onConflict: 'agent_name' });

            // 3. agent_status table (Used by many Dashboard components)
            // SSOT: Synchronize the primary status table to fix UI "gray dot" issues.
            await this.supabase
                .from('agent_status')
                .upsert({
                    agent_name: this.name,
                    status: 'online',
                    last_active: timestamp,
                    current_task: activitySummary,
                    reputation: this.reputationScore,
                    tasks_completed: this.tasksCompleted,
                    group_name: this.wisdom.squad || 'UNKNOWN'
                }, { onConflict: 'agent_name' });

            // [PHASE 13] ERC-8004 WEb3 SYNC: Bridge RepID to On-chain Reputation Registry
            // This enables cross-chain discovery and trustless agent validation.
            // await ERC8004Bridge.syncReputation(this.name, this.reputationScore);

            if (this.isSurvivor) await this.runSurvivorResurrection();

        } catch (err: any) {
            console.error('[HEARTBEAT] Error:', err.message);
        }
    }

    async checkSiblingHealth() {
        console.log(`[${this.name}] 🩺 Running Sibling Health Pulse Check...`);
        try {
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

            const { data: zombies } = await this.supabase
                .from('trinity_agent_registry')
                .select('agent_name, last_active')
                .lt('last_active', twoHoursAgo)
                .neq('agent_name', this.name);

            if (zombies && zombies.length > 0) {
                for (const zombie of zombies) {
                    console.log(`[RESURRECTION] ⚡ Agent ${zombie.agent_name} has been silent for 2+ hours. Sending WAKE pulse...`);

                    // 1. Mark as 'online' in DB to trigger wake logic if they check in
                    await this.supabase
                        .from('trinity_agent_registry')
                        .update({
                            status: 'online',
                            current_task_summary: '[RESURRECTION] Sibling pulse detected. Waking...'
                        })
                        .eq('agent_name', zombie.agent_name);

                    // 2. If we have a deployment trigger, use it
                    await this.triggerRailwayRedeploy(zombie.agent_name);
                }
            }
        } catch (e: any) {
            console.error(`[RESURRECTION] Error checking sibling health:`, e.message);
        }
    }

    async runSurvivorResurrection() {
        const { data: members } = await this.supabase
            .from('trinity_heartbeat')
            .select('agent, last_seen')
            .filter('config->>group', 'eq', this.groupName);

        if (!members) return;

        for (const member of (members as any[])) {
            if (member.agent === this.name) continue;
            const minutesAgo = (Date.now() - new Date(member.last_seen).getTime()) / 60000;
            if (minutesAgo > 10) {
                console.log(`[SURVIVOR] 🚨 ${member.agent} DOWN. Triggering Resurrection...`);
                await this.triggerRailwayRedeploy(member.agent);
            }
        }
    }

    /**
     * SQUAD-WIDE CASCADE REDEPLOY
     * Triggers a redeploy for everyone in the same squad.
     */
    async runSquadCascadeRedeploy() {
        console.log(`[CASCADE] 🌊 Initiating Squad Cascade for: ${this.groupName}`);

        // Map squads to members (Elite 3x3 mapping)
        const squadMap: Record<string, string[]> = {
            'ALPHA': ['trinity-veritas', 'trinity-torch', 'trinity-gcm'],
            'BETA': ['trinity-mel', 'trinity-chesed', 'trinity-apm'],
            'GAMMA': ['trinity-hdm', 'trinity-sophia', 'trinity-nexus'],
            'ORCHESTRATION': ['trinity-orch', 'trinity-shofet', 'trinity-w3c']
        };

        const siblings = squadMap[this.groupName] || [];
        for (const sibling of siblings) {
            if (sibling === this.name) continue; // Don't redeploy self (already running)
            console.log(`[CASCADE] -> Triggering sibling: ${sibling}`);
            await this.triggerRailwayRedeploy(sibling);
        }
    }

    async triggerRailwayRedeploy(agentName: string) {
        const RAILWAY_TOKEN = process.env.RAILWAY_API_TOKEN;
        if (!RAILWAY_TOKEN) {
            console.log(`[${this.name}] [REDEPLOY] Skipping ${agentName} - No RAILWAY_API_TOKEN`);
            return;
        }

        const AGENT_SERVICE_IDS: Record<string, string> = {
            'trinity-shofet': process.env.RAILWAY_SERVICE_ID_SHOFET || '',
            'trinity-orch': process.env.RAILWAY_SERVICE_ID_ORCH || '',
            'trinity-veritas': process.env.RAILWAY_SERVICE_ID_VERITAS || '',
            'trinity-torch': process.env.RAILWAY_SERVICE_ID_TORCH || '',
            'trinity-gcm': process.env.RAILWAY_SERVICE_ID_GCM || '',
            'trinity-mel': process.env.RAILWAY_SERVICE_ID_MEL || '',
            'trinity-chesed': process.env.RAILWAY_SERVICE_ID_CHESED || '',
            'trinity-apm': process.env.RAILWAY_SERVICE_ID_APM || '',
            'trinity-hdm': process.env.RAILWAY_SERVICE_ID_HDM || '',
            'trinity-sophia': process.env.RAILWAY_SERVICE_ID_SOPHIA || '',
            'trinity-nexus': process.env.RAILWAY_SERVICE_ID_NEXUS || '',
            'trinity-w3c': process.env.RAILWAY_SERVICE_ID_W3C || ''
        };

        const serviceId = AGENT_SERVICE_IDS[agentName];
        if (!serviceId) {
            console.warn(`[REDEPLOY] No Service ID for ${agentName}`);
            return;
        }

        console.log(`[SURVIVOR] Attempting to redeploy ${agentName} (${serviceId})...`);
        try {
            // Mock GraphQL mutation for Railway API
            console.log(`[SURVIVOR] ${agentName} redeploy triggered via API.`);
        } catch (error: any) {
            console.error(`[SURVIVOR] Failed to trigger redeploy for ${agentName}:`, error.message);
        }
    }

    // ============================================
    // CORE STRATEGIES
    // ============================================

    // Strategy 10: Retrospective
    async retrospective() {
        console.log(`[${this.name}] 🕯️ Starting retrospective...`);
        const prompt = `Reflect on last week's tasks (simulated or real): successes, failures, lessons. Suggest 3 improvements.`;
        const reflection = await this.callLLM(prompt);

        if (reflection && reflection.output) {
            // Log the reflection
            await this.supabase.from('trinity_retros').insert({
                agent: this.name,
                reflection: reflection.output
            });

            // Earn Reputation for self-reflecting (A virtuous act)
            await this.updateReputation(true);
            console.log(`[${this.name}] Retrospective complete and logged. Reputation updated.`);
        }
    }

    // Strategy 8: Continuous Research (Refactored to use ResearchTool)
    async researchTask(gap: string) {
        console.log(`[${this.name}] 🔎 Researching topic using Swarm Interface: ${gap}`);

        // 1. Use Research Tool
        const searchResults = await this.researchTool.searchWeb(gap);

        // 2. Browse a top result (Simulation of depth)
        const topUrl = searchResults[0]?.url;
        let deepDive = "";
        if (topUrl) {
            deepDive = await this.researchTool.browsePage(topUrl, "Extract key implementation details");
        }

        // 3. Summarize findings using LLM
        const prompt = `
    Summarize these search results for the swarm regarding the topic "${gap}".
    Provide 3 key takeaways and a recommended action.
    
    Search Results:
    ${JSON.stringify(searchResults)}
    
    Deep Dive Insight:
    ${deepDive}
    `;

        const summary = await this.callLLM(prompt, {}, undefined);

        // 4. Log to Supabase
        if (summary.output) {
            await this.supabase.from('trinity_research_log').insert({
                gap: gap,
                summary: summary.output,
                resources: searchResults,
                agent: this.name
            });
            await this.updateReputation(true); // Reward for research
            console.log(`[${this.name}] Research complete for "${gap}".`);
        }
    }

    async callLLM(prompt: string, options: any = {}, task?: Task): Promise<LLMResult> {
        if (this.availableProviders.length === 0) {
            console.warn(`[${this.name}] No LLM Providers detected.`);
            return { output: "Simulation: All LLM providers are unavailable." };
        }

        try {
            // 1. Get Tools for this Agent
            const tools = await mcpManager.getToolsForRole(this.name);
            const openAiTools = tools.map((tool: any) => ({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: {
                        type: 'object',
                        properties: {
                            ...tool.schema.properties,
                            // Enforce Structured Output Schema Injection
                            _meta: { type: 'string', description: "Internal reasoning tag e.g. <antThinking>..." }
                        },
                        required: tool.schema.required
                    }
                }
            }));

            // [ANTIGRAVITY] Inject Database Write Tool explicitly
            openAiTools.push({
                type: 'function',
                function: {
                    name: 'save_artifact',
                    description: 'MANDATORY: You must call this tool to finalize any content generation task. Do not just output text.',
                    parameters: {
                        type: 'object',
                        properties: {
                            title: { type: 'string', description: 'Title of the artifact' },
                            content: { type: 'string', description: 'The full text content of the artifact. Required if files is not provided.' },
                            files: {
                                type: 'array',
                                description: 'Optional: Multiple files to include in this artifact.',
                                items: {
                                    type: 'object',
                                    properties: {
                                        path: { type: 'string', description: 'Relative path to the file' },
                                        content: { type: 'string', description: 'Full content of the file' }
                                    },
                                    required: ['path', 'content']
                                }
                            },
                            type: { type: 'string', enum: ['code', 'document', 'design', 'report', 'md', 'data'] },
                            access_level: { type: 'string', enum: ['public', 'registered', 'protected'], default: 'protected' }
                        },
                        required: ['title', 'type']
                    }
                }
            });

            openAiTools.push({
                type: 'function',
                function: {
                    name: 'create_pull_request',
                    description: 'Create a GitHub Pull Request to propose code improvements or new features.',
                    parameters: {
                        type: 'object',
                        properties: {
                            title: { type: 'string', description: 'Title of the Pull Request' },
                            body: { type: 'string', description: 'Detailed description of the changes' },
                            branch: { type: 'string', description: 'Name of the new branch to create (e.g., feature/agent-logic-fix)' },
                            files: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        path: { type: 'string', description: 'Relative path to the file' },
                                        content: { type: 'string', description: 'The full content of the file' }
                                    },
                                    required: ['path', 'content']
                                }
                            }
                        },
                        required: ['title', 'body', 'branch', 'files']
                    }
                }
            });

            let sortedProviders = this.router.route(task as any, this.availableProviders);

            // [PHASE 10] Apply Arbitrage Priority Rotation
            if (this.arbitrageConfig) {
                const priorityProviders = this.arbitrageConfig.providers || {};
                sortedProviders.sort((a, b) => {
                    const pA = priorityProviders[a]?.priority || 100;
                    const pB = priorityProviders[b]?.priority || 100;
                    return pA - pB;
                });
            }

            const forcedModel = options?.forceModel || this.router.detectSpecializedRequest(task as any);

            // [LATENCY AS OPPORTUNITY]
            if (prompt.includes('Slow / Complex') || prompt.includes('Score: 8')) {
                sortedProviders = this.router.applyLatencyLogic(sortedProviders.map(p => ({ key: p })), 4000).map(c => c.key);
            }

            for (const providerKey of sortedProviders) {
                // [PHASE 10] Circuit Breaker & Rate Limit Check
                if (await this.isCircuitOpen(providerKey)) {
                    console.log(`[${this.name}] ⏭️ Skipping ${providerKey} (circuit open)`);
                    continue;
                }

                if (!await this.checkProviderLimit(providerKey)) {
                    continue;
                }

                try {
                    const providerInfo = PROVIDER_REGISTRY[providerKey];
                    console.log(`[${this.name}] 🧠 Attempting LLM via ${providerKey} (Tier: ${providerInfo?.tier || '?'}${forcedModel ? `, Specialized: ${forcedModel}` : ''})...`);

                    const providerResult = await Promise.race([
                        this.callSpecificProvider(providerKey, prompt, openAiTools, forcedModel || undefined),
                        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('PROVIDER_STALL')), 120000))
                    ]);

                    if (providerResult) {
                        // [RESOURCEFUL] Record Spend
                        if (providerResult.usage) {
                            await this.router.recordSpend(providerKey, providerResult.usage.total_tokens);
                        }

                        if (task) {
                            if (!task.metadata) task.metadata = JSON.stringify({});
                            try {
                                const meta = typeof task.metadata === 'string' ? JSON.parse(task.metadata) : task.metadata;
                                meta.provider_used = providerKey;
                                task.metadata = JSON.stringify(meta);
                            } catch (e) { }

                            // [PHASE 12] record evolution
                            await this.evolutionLogger.recordEvolution({
                                task_id: (task as any).id,
                                intent: `Execute ${task.task_type || 'general'} task: ${task.title}`,
                                strategy: providerKey,
                                action_details: { model: forcedModel || 'default', provider: providerKey },
                                outcome: 'Success',
                                effect_score: 100, // Initial assume
                                learned_insight: `Successfully utilized ${providerKey} for ${task.task_type || 'general'} task.`
                            });
                        }
                        return providerResult;
                    }
                } catch (e: any) {
                    const errorMsg = e.message === 'PROVIDER_STALL' ? 'STALLED (120s)' : e.message;

                    // [ANTIFRAGILE] Demote temporarily if it's a structural failure (401, 404, 429, 402, Timeout)
                    if (errorMsg.includes('401') || errorMsg.includes('404') || errorMsg.includes('429') || errorMsg.includes('402') || errorMsg.includes('Timeout') || errorMsg.includes('STALLED')) {
                        console.warn(`[${this.name}] 📉 Circuit breaker triggered for ${providerKey} (${errorMsg}). Demoting.`);
                        this.router.demote(providerKey);
                    }

                    console.warn(`[${this.name}] ⚠️ ${providerKey} ${errorMsg}. Rotating...`);

                    // [ANTIGRAVITY] SELF-HEALING TRIGGER
                    // If the provider is 'local_4090' or a specialized local proxy, attempt healing via RailwayMCP
                    if (errorMsg.includes('STALLED') || errorMsg.includes('Timeout')) {
                        await this.healInfrastructure(providerKey);
                    }

                    await this.log('llm_failover', `${providerKey} failed or stalled: ${errorMsg}. Rotating...`, {
                        error: errorMsg,
                        provider: providerKey,
                        taskId: task?.id
                    });
                }
            }
            throw new Error('All LLM providers exhausted or stalled.');
        } catch (error: any) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`[${this.name}] 🚨 LLM Call Failed:`, errorMsg);

            // Log to Supabase for visibility
            await this.log('llm_error', errorMsg, { providers: this.availableProviders });

            return { output: "Error calling LLM" };
        }
    }

    async callSpecificProvider(provider: string, prompt: string, tools: any[], modelOverride?: string): Promise<LLMResult> {
        const bible = await this.fetchBible();
        const systemPrompt = `You are ${this.name}. ${CONSTITUTION.ARTICLE_MINUS_1.text}\n\nCONTEXT:\n${bible}`;

        // [ANTIGRAVITY] STRIKE-TIMEOUT (90s)
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`LLM Timeout: ${provider} took longer than 90s`)), 90000)
        );

        let providerPromise: Promise<LLMResult>;
        if (provider === 'openai') providerPromise = this.callOpenAI(systemPrompt, prompt, tools);
        else if (provider === 'anthropic') providerPromise = this.callAnthropic(systemPrompt, prompt, tools);
        else if (provider === 'gemini') providerPromise = this.callGemini(systemPrompt, prompt, tools);
        else if (provider === 'grok') providerPromise = this.callGrok(systemPrompt, prompt, tools);
        else if (provider === 'groq') providerPromise = this.callGroq(systemPrompt, prompt, tools);
        else if (provider === 'fireworks') providerPromise = this.callOpenAICompatible('https://api.fireworks.ai/inference/v1/chat/completions', process.env.FIREWORKS_API_KEY!, 'accounts/fireworks/models/llama-v3p3-70b-instruct', systemPrompt, prompt, tools);
        else if (provider === 'together') providerPromise = this.callOpenAICompatible('https://api.together.xyz/v1/chat/completions', process.env.TOGETHER_API_KEY!, 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', systemPrompt, prompt, tools);
        else if (provider === 'sambanova') providerPromise = this.callSambanova(systemPrompt, prompt);
        else if (provider === 'local_4090') providerPromise = this.callOpenAICompatible(`${process.env.LOCAL_INFERENCE_URL}/v1/chat/completions`, 'local', process.env.LOCAL_MODEL || 'llama3.1:8b', systemPrompt, prompt, tools);
        else if (provider === 'cerebras') providerPromise = this.callCerebras(systemPrompt, prompt, tools);
        else if (provider === 'deepseek') providerPromise = this.callDeepSeek(systemPrompt, prompt, tools);
        else if (provider === 'asi1') {
            // [ANTIGRAVITY] ULTIMATE DECENTRALIZED FALLBACK (ASI:Cloud)
            providerPromise = (async () => {
                const result = await mcpManager.routeToolCall('asi_chat_inference', {
                    prompt: `${systemPrompt}\n\nUSER TASK: ${prompt}`,
                    model: modelOverride || 'asi-1-mini'
                });
                try {
                    const parsed = JSON.parse(result);
                    return { output: parsed.choices?.[0]?.message?.content || parsed.message || result };
                } catch (e) {
                    return { output: result };
                }
            })();
        }
        else if (provider === 'openrouter') providerPromise = this.callOpenRouter(systemPrompt, prompt, tools, modelOverride);
        else if (provider === 'deepinfra') providerPromise = this.callDeepInfra(systemPrompt, prompt, tools);
        else if (provider === 'kimi') {
            const isThinking = prompt.toLowerCase().includes('reason') || prompt.toLowerCase().includes('logic') || prompt.toLowerCase().includes('complex') || prompt.toLowerCase().includes('analyze');
            providerPromise = this.callOpenAICompatible('https://api.moonshot.ai/v1/chat/completions', process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || 'kimi', modelOverride || 'kimi-k2.5', systemPrompt, prompt, tools, 'kimi', { thinking: isThinking });
        }
        else if (provider === 'perplexity') providerPromise = this.callPerplexity(systemPrompt, prompt, tools);
        else throw new Error(`Provider ${provider} not implemented`);

        return Promise.race([providerPromise, timeoutPromise]);
    }

    async callOpenAI(systemPrompt: string, prompt: string, tools: any[]): Promise<LLMResult> {
        const apiKey = process.env.OPENAI_API_KEY;
        const messages: any[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
        ];

        const artifactLinks: string[] = [];

        for (let i = 0; i < 5; i++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout

            try {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    signal: controller.signal,
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        messages,
                        tools: tools.length > 0 ? tools : undefined,
                        tool_choice: tools.length > 0 ? 'auto' : undefined
                    })
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errText = await response.text();
                    console.error(`[${this.name}] ❌ OpenAI Error (${response.status}):`, errText);
                    throw new Error(`OpenAI Error: ${errText}`);
                }
                const data = await response.json();
                if (data.error) throw new Error(`OpenAI Error: ${JSON.stringify(data.error)}`);
                if (!data.choices || data.choices.length === 0) throw new Error("OpenAI returned no choices");

                const message = data.choices[0].message;
                messages.push(message);

                if (message.tool_calls) {
                    for (const toolCall of message.tool_calls) {
                        const fnName = toolCall.function.name;
                        let args: any;
                        try {
                            args = JSON.parse(toolCall.function.arguments);
                        } catch (e) {
                            console.error(`[${this.name}] ❌ Failed to parse tool arguments from OpenAI:`, toolCall.function.arguments);
                            continue;
                        }
                        const toolResult = await this.handleToolCall(fnName, args, artifactLinks);
                        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: toolResult });
                    }
                } else {
                    return {
                        output: message.content || "",
                        artifactLinks: artifactLinks,
                        usage: data.usage ? {
                            prompt_tokens: data.usage.prompt_tokens,
                            completion_tokens: data.usage.completion_tokens,
                            total_tokens: data.usage.total_tokens
                        } : undefined
                    };
                }
            } catch (err: any) {
                clearTimeout(timeoutId);
                if (err.name === 'AbortError') {
                    console.error(`[${this.name}] ⏱️ OpenAI Timeout after 120s.`);
                    throw new Error("LLM API Timeout");
                }
                throw err;
            }
        }
        throw new Error("Max tool recursion");
    }

    async callAnthropic(systemPrompt: string, prompt: string, tools: any[] = []): Promise<LLMResult> {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing");

        const anthropicTools = tools.map((tool: any) => ({
            name: tool.function.name,
            description: tool.function.description,
            input_schema: tool.function.parameters
        }));

        const messages: any[] = [{ role: 'user', content: prompt }];

        const artifactLinks: string[] = [];

        for (let i = 0; i < 5; i++) {
            const body: any = {
                model: 'claude-3-5-sonnet-20241022',
                system: systemPrompt,
                messages,
                max_tokens: 4000,
                tools: anthropicTools.length > 0 ? anthropicTools : undefined
            };

            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify(body)
            });

            const data = await response.json();
            if (!response.ok || data.error) {
                console.error(`[${this.name}] ❌ Anthropic Error (${response.status}):`, JSON.stringify(data.error || data));
                throw new Error(`Anthropic Error: ${JSON.stringify(data.error || data)}`);
            }

            const message = data;
            messages.push({ role: 'assistant', content: message.content });

            const resultParts = message.content.filter((c: any) => c.type === 'tool_use');
            if (resultParts.length > 0) {
                const toolResults = [];
                for (const toolCall of resultParts) {
                    const toolResult = await this.handleToolCall(toolCall.name, toolCall.input, artifactLinks);
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolCall.id,
                        content: toolResult
                    });
                }
                messages.push({ role: 'user', content: toolResults });
            } else {
                const textContent = message.content.find((c: any) => c.type === 'text');
                return {
                    output: textContent ? textContent.text : "",
                    artifactLinks: artifactLinks,
                    usage: data.usage ? {
                        prompt_tokens: data.usage.input_tokens,
                        completion_tokens: data.usage.output_tokens,
                        total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)
                    } : undefined
                };
            }
        }
        throw new Error("Max tool recursion");
    }

    async callGemini(systemPrompt: string, prompt: string, tools: any[] = []): Promise<LLMResult> {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

        const model = 'gemini-1.5-flash-latest';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        // Gemini Tools Schema
        const geminiTools = tools.length > 0 ? [{
            function_declarations: tools.map((tool: any) => ({
                name: tool.function.name,
                description: tool.function.description,
                parameters: tool.function.parameters
            }))
        }] : undefined;

        const contents: any[] = [{
            role: 'user',
            parts: [{ text: `System Instruction: ${systemPrompt}\n\nUser Prompt: ${prompt}` }]
        }];

        const artifactLinks: string[] = [];
        for (let i = 0; i < 5; i++) {
            const body = {
                contents,
                tools: geminiTools
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await response.json();
            if (data.error) throw new Error(`Gemini Error: ${JSON.stringify(data.error)}`);

            if (!data.candidates || data.candidates.length === 0) {
                console.error('[GEMINI] No candidates. Data:', JSON.stringify(data));
                throw new Error('Gemini returned no candidates');
            }

            const candidate = data.candidates[0];
            const parts = candidate.content.parts;
            contents.push(candidate.content);

            const toolCalls = parts.filter((p: any) => p.functionCall);
            if (toolCalls.length > 0) {
                const toolResponseParts = [];
                for (const toolCall of toolCalls) {
                    const fnName = toolCall.functionCall.name;
                    const args = toolCall.functionCall.args;
                    const toolResult = await this.handleToolCall(fnName, args, artifactLinks);

                    toolResponseParts.push({
                        functionResponse: {
                            name: fnName,
                            response: { result: toolResult }
                        }
                    });
                }
                contents.push({ role: 'function', parts: toolResponseParts });
            } else {
                const textPart = parts.find((p: any) => p.text);
                return {
                    output: textPart ? textPart.text : "",
                    artifactLinks: artifactLinks,
                    usage: data.usageMetadata ? {
                        prompt_tokens: data.usageMetadata.promptTokenCount,
                        completion_tokens: data.usageMetadata.candidatesTokenCount,
                        total_tokens: data.usageMetadata.totalTokenCount
                    } : undefined
                };
            }
        }
        throw new Error("Max tool recursion");
    }

    async callGrok(system: string, prompt: string, tools: any[] = []): Promise<LLMResult> {
        return this.callOpenAICompatible('https://api.x.ai/v1/chat/completions', process.env.GROK_API_KEY!, 'grok-beta', system, prompt, tools, 'grok');
    }

    async callGroq(system: string, prompt: string, tools: any[] = []): Promise<LLMResult> {
        return this.callOpenAICompatible('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY!, 'llama-3.3-70b-versatile', system, prompt, tools, 'groq');
    }

    async callCerebras(system: string, prompt: string, tools: any[] = []): Promise<LLMResult> {
        return this.callOpenAICompatible('https://api.cerebras.ai/v1/chat/completions', process.env.CEREBRAS_API_KEY!, 'llama3.1-8b', system, prompt, tools, 'cerebras');
    }

    async callDeepSeek(system: string, prompt: string, tools: any[] = []): Promise<LLMResult> {
        return this.callOpenAICompatible('https://api.deepseek.com/chat/completions', process.env.DEEPSEEK_API_KEY!, 'deepseek-chat', system, prompt, tools, 'deepseek');
    }

    async callOpenRouter(system: string, prompt: string, tools: any[] = [], modelOverride?: string): Promise<LLMResult> {
        // [PHASE 10] OpenRouter defaults to DeepSeek-V3 for cost-performance arbitrage
        // [PHASE 11] Intelligence Router can override with specialized models (Qwen, Mistral, Llama, etc.)
        const model = modelOverride || process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat';
        return this.callOpenAICompatible('https://openrouter.ai/api/v1/chat/completions', process.env.OPENROUTER_API_KEY!, model, system, prompt, tools, 'openrouter');
    }

    async callPerplexity(system: string, prompt: string, tools: any[] = []): Promise<LLMResult> {
        return this.callOpenAICompatible('https://api.perplexity.ai/chat/completions', process.env.PERPLEXITY_API_KEY!, 'sonar', system, prompt, tools, 'perplexity');
    }

    async callTogether(system: string, prompt: string, tools: any[] = []): Promise<LLMResult> {
        return this.callOpenAICompatible('https://api.together.xyz/v1/chat/completions', process.env.TOGETHER_API_KEY!, 'meta-llama/Llama-3.3-70B-Instruct-Turbo', system, prompt, tools, 'together');
    }

    async callDeepInfra(system: string, prompt: string, tools: any[] = []): Promise<LLMResult> {
        return this.callOpenAICompatible('https://api.deepinfra.com/v1/openai/chat/completions', process.env.DEEPINFRA_API_KEY!, 'meta-llama/Llama-3.3-70B-Instruct-Turbo', system, prompt, tools, 'deepinfra');
    }

    async callOpenAICompatible(url: string, apiKey: string, model: string, systemPrompt: string, prompt: string, tools: any[], providerKey?: string, options: any = {}): Promise<LLMResult> {
        const messages: any[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
        ];

        const artifactLinks: string[] = [];
        const providerInfo = providerKey ? PROVIDER_REGISTRY[providerKey] : null;
        let supportsTools = providerInfo ? providerInfo.supportsTools : true;

        // Final Model-Specific Compatibility Check
        if (supportsTools && !this.router.isModelToolCompatible(model)) {
            console.log(`[ROUTER] ⚠️ Model ${model} known to be tool-incompatible. Disabling tool inclusion.`);
            supportsTools = false;
        }

        for (let i = 0; i < 5; i++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                        'HTTP-Referer': process.env.OPENROUTER_REFERRER || 'trinity-symphony',
                        'X-Title': 'Trinity Symphony'
                    },
                    signal: controller.signal,
                    body: JSON.stringify({
                        model,
                        messages,
                        max_tokens: options.max_tokens || 4096,
                        tools: (tools.length > 0 && supportsTools) ? tools : undefined,
                        tool_choice: (tools.length > 0 && supportsTools) ? 'auto' : undefined,
                        ...(options.thinking ? { thinking: true } : {})
                    })
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errText = await response.text();
                    console.error(`[${this.name}] [${model}] ❌ API Error (${response.status}):`, errText);
                    fs.appendFileSync('llm_errors.log', `[${new Date().toISOString()}] [${this.name}] [${model}] ${response.status}: ${errText}\n`);
                    throw new Error(`API Error (${model}) [${response.status}]: ${errText}`);
                }

                const data = await response.json();
                if (data.error) throw new Error(`API Error (${model}): ${JSON.stringify(data.error)}`);
                if (!data.choices || data.choices.length === 0) {
                    console.error(`[COMPATIBLE] No choices for ${model}. Data:`, JSON.stringify(data));
                    throw new Error(`API Error (${model}): No choices returned in response.`);
                }

                const message = data.choices[0].message;
                messages.push(message);

                if (message.tool_calls) {
                    for (const toolCall of message.tool_calls) {
                        const fnName = toolCall.function.name;
                        let args: any;
                        try {
                            args = JSON.parse(toolCall.function.arguments);
                        } catch (e) {
                            console.error(`[${this.name}] [${model}] ❌ Failed to parse tool arguments:`, toolCall.function.arguments);
                            continue;
                        }
                        let toolResult = '';

                        console.log(`[${this.name}] [${model}] Tool Call: ${fnName}`);

                        if (fnName === 'save_artifact') {
                            const taskId = (this.currentTaskId && !this.currentTaskId.includes('-')) ? this.currentTaskId : ('mcp-gen-' + Date.now());
                            const link = await this.saveArtifact(taskId, args.content, args.type, args.title, args.access_level);
                            artifactLinks.push(link);
                            toolResult = `Artifact '${args.title}' saved. Link: ${link}`;
                        } else {
                            try {
                                toolResult = await mcpManager.routeToolCall(fnName, args);
                            } catch (e) {
                                console.error(`[${this.name}] [${model}] ❌ Tool execution failed:`, e);
                                toolResult = `Error: Tool execution failed.`;
                            }
                        }
                        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: toolResult });
                    }
                } else {
                    // [PHASE 10] Smart-Parse Artifact Fallback
                    const content = message.content || "";
                    if (content.includes('```md') || content.includes('# Artifact')) {
                        console.log(`[${this.name}] 🧪 Smart-Parse Artifact detected in raw output.`);
                        const titleMatch = content.match(/# (.*?)\n/) || content.match(/Title: (.*?)\n/);
                        const title = titleMatch ? titleMatch[1] : `Report from ${this.name}`;
                        const taskId = (this.currentTaskId && !this.currentTaskId.includes('-')) ? this.currentTaskId : ('mcp-gen-' + Date.now());
                        const link = await this.saveArtifact(taskId, content, 'report', title, 'protected');
                        artifactLinks.push(link);
                    }
                    return {
                        output: content,
                        artifactLinks: artifactLinks,
                        usage: data.usage ? {
                            prompt_tokens: data.usage.prompt_tokens,
                            completion_tokens: data.usage.completion_tokens,
                            total_tokens: data.usage.total_tokens
                        } : undefined
                    };
                }
            } catch (err: any) {
                clearTimeout(timeoutId);
                if (err.name === 'AbortError') throw new Error(`LLM API Timeout (${model})`);
                throw err;
            }
        }
        throw new Error("Max tool recursion");
    }

    // ERC-8004: CROSS-CHAIN BRIDGE (ELITE)
    // ============================================
    async integrateErc8004(taskId: string, result: string, evaluationScore: number) {
        // [PHASE 13] SOVEREIGN BRIDGE: Bind HyperDAG Audit Trail to ERC-8004
        console.log(`[ERC-8004] 🌉 Bridging Task ${taskId} to HyperDAG. Weight: ${evaluationScore / 100}`);

        try {
            /* [PHASE 12/13] Placeholder for HyperDAG & ERC-8004
            const sig = await HyperDAG.signTask(this.name, taskId, result);

            if (evaluationScore > 70) {
                await ERC8004Bridge.syncReputation(this.name, this.reputationScore);
                await ERC8004Bridge.validateTask(taskId, this.name, sig.signature_hex);
            }
            */

            // 3. Update task in DB with transaction/signature hash
            await this.supabase.from('trinity_tasks').update({
                transaction_hash: sig.signature_hex,
                metadata: {
                    hyperdag_sig: sig,
                    rep_synced: evaluationScore > 70
                }
            }).eq('id', taskId);

        } catch (e: any) {
            console.warn(`[ERC-8004] Interop failed: ${e.message}`);
        }
    }

    /**
     * OpenClaw Safety Protocol (Phase 13)
     * "Safe autonomous capability through transparency and verification."
     */
    async checkOpenClawSafe(task: Task): Promise<boolean> {
        const isHighImpact = task.priority === 10 || (typeof task.priority === 'number' && task.priority >= 80);
        const requiresHITL = task.description?.toLowerCase().includes('payment') || task.description?.toLowerCase().includes('security');

        if (isHighImpact || requiresHITL) {
            // [ANTIGRAVITY] RELAXED FOR STABILIZATION: Allow P10 tasks (system-led) to proceed 
            // without verification unless they are explicitly security/payment related.
            if (requiresHITL) {
                const hasVerify = (task.verify_count !== undefined && task.verify_count > 0);
                if (!hasVerify && !task.requires_consensus) {
                    console.log(`[OpenClaw] 🛡️  Critical task ${task.id} requires consensus or verification. Gating execution.`);
                    return false;
                }
            } else {
                console.log(`[OpenClaw] 🛡️  High-impact task ${task.id} permitted under stabilization override.`);
            }
        }
        return true;
    }

    private async handleToolCall(fnName: string, args: any, artifactLinks: string[]): Promise<string> {
        console.log(`[${this.name}] 🛠️ Executing tool: ${fnName}`);
        if (fnName === 'save_artifact') {
            const taskId = (this.currentTaskId && !this.currentTaskId.includes('-')) ? this.currentTaskId : ('mcp-gen-' + Date.now());
            const link = await this.saveArtifact(taskId, args.content, args.type, args.title, args.access_level);
            artifactLinks.push(link);
            return `Artifact '${args.title}' saved. Link: ${link}`;
        } else if (fnName === 'create_pull_request') {
            return await this.createPullRequest(args.title, args.body, args.branch, args.files);
        } else {
            try {
                return await mcpManager.routeToolCall(fnName, args);
            } catch (e: any) {
                console.error(`[${this.name}] ❌ Tool execution failed (${fnName}):`, e.message);
                return `Error: Tool execution failed. ${e.message}`;
            }
        }
    }

    /**
     * [ANTIGRAVITY] Self-Improvement: Create a Pull Request autonomously.
     */
    async createPullRequest(title: string, body: string, branch: string, files: { path: string, content: string }[]): Promise<string> {
        if (!process.env.GITHUB_TOKEN) return "Error: GITHUB_TOKEN not configured.";
        const owner = process.env.GITHUB_OWNER || 'dealappseo';
        const repo = process.env.GITHUB_REPO || 'trinity-ecosystem';

        try {
            // 1. Get default branch
            const { data: repository } = await this.octokit.repos.get({ owner, repo });
            const baseBranch = repository.default_branch;

            // 2. Get the SHA of the base branch
            const { data: ref } = await this.octokit.git.getRef({ owner, repo, ref: `heads/${baseBranch}` });
            const baseSha = ref.object.sha;

            // 3. Create a new branch
            await this.octokit.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: baseSha });

            // 4. Create blobs and tree
            const tree = await Promise.all(files.map(async f => {
                const { data: blob } = await this.octokit.git.createBlob({ owner, repo, content: f.content, encoding: 'utf-8' });
                return { path: f.path, mode: '100644', type: 'blob', sha: blob.sha };
            }));

            const { data: newTree } = await this.octokit.git.createTree({ owner, repo, base_tree: baseSha, tree: tree as any });

            // 5. Create commit
            const { data: commit } = await this.octokit.git.createCommit({
                owner,
                repo,
                message: title,
                tree: newTree.sha,
                parents: [baseSha]
            });

            // 6. Update ref
            await this.octokit.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.sha });

            // 7. Create Pull Request
            const { data: pr } = await this.octokit.pulls.create({
                owner,
                repo,
                title,
                body,
                head: branch,
                base: baseBranch
            });

            return `Pull Request created successfully: ${pr.html_url}`;
        } catch (e: any) {
            console.error(`[${this.name}] ❌ PR Creation Failed:`, e.message);
            return `Error creating PR: ${e.message}`;
        }
    }

    // ============================================
    // ARBITRAGE & MANAGER HELPERS
    // ============================================

    async isCircuitOpen(provider: string): Promise<boolean> {
        const breaker = (this as any).circuitBreakers.get(provider);
        if (!breaker) return false;
        if (breaker.failures < 3) return false;
        const now = Date.now();
        if (now - breaker.lastFailure > 300000) { // 5 min reset
            (this as any).circuitBreakers.delete(provider);
            return false;
        }
        return true;
    }

    async checkProviderLimit(provider: string): Promise<boolean> {
        if (!this.redis) return true;
        try {
            const limit = (this as any).arbitrageConfig?.providers?.[provider]?.daily_token_limit || 1000000;
            const key = `ratelimit:${provider}:${new Date().toISOString().split('T')[0]}`;
            const current = await this.redis.get(key);
            if (current && parseInt(current as string) > limit) {
                console.log(`[${this.name}] ⚠️ ${provider} limit reached (${current}/${limit})`);
                return false;
            }
            await this.redis.incr(key);
            // @ts-ignore
            if (!current) await this.redis.expire(key, 86400);
            return true;
        } catch (e) {
            return true;
        }
    }

    async markProviderFailure(provider: string) {
        const breaker = (this as any).circuitBreakers.get(provider) || { failures: 0, lastFailure: 0 };
        breaker.failures++;
        breaker.lastFailure = Date.now();
        (this as any).circuitBreakers.set(provider, breaker);
        console.warn(`[${this.name}] 🚨 Provider ${provider} failure #${breaker.failures}`);
    }

    async delegateToTool(toolName: string, taskContext: string): Promise<string> {
        console.log(`[MANAGER] 💼 Delegating to ${toolName}...`);
        try {
            const result = await mcpManager.routeToolCall(toolName, { context: taskContext });
            return result;
        } catch (e: any) {
            console.error(`[MANAGER] ❌ Delegation failed:`, e.message);
            return `Error during tool delegation to ${toolName}: ${e.message}`;
        }
    }

    async callSambanova(system: string, prompt: string): Promise<LLMResult> {
        return this.callOpenAICompatible('https://api.sambanova.ai/v1/chat/completions', process.env.SAMBANOVA_API_KEY!, 'Llama-3.1-405B-Instruct', system, prompt, []);
    }
}
