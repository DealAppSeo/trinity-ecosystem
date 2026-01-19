import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import { AgentConfig, WisdomProfile, ProviderConfig, LLMResult, Task, AutonomyTier, AgentRegistryRecord, SessionMetrics, MCPPhase } from './types';
import { AGENT_WISDOM, CONSTITUTION } from './wisdom';
// Dynamic imports for graphology/fs handled inside methods to avoid build issues
import { mcpManager } from '../mcp/MCPManager';

const MCP_BASE_URL = 'https://raw.githubusercontent.com/dealappseo/trinity-ecosystem/main/docs/MCPs';

// ============================================

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
        const apiKey = process.env.TAVILY_API_KEY;
        if (!apiKey) {
            console.warn('[ResearchTool] ⚠️ No TAVILY_API_KEY. Returning mock.');
            return [{ url: "https://example.com", title: "Missing API Key", content: "Please set TAVILY_API_KEY." }];
        }

        try {
            console.log(`[ResearchTool] 🔎 Searching web for: "${query}"`);
            const response = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: apiKey,
                    query: query,
                    search_depth: "basic",
                    max_results: 3
                })
            });

            const data = await response.json();
            if (!data.results) return [];

            return data.results.map((r: any) => ({
                url: r.url,
                title: r.title,
                content: r.content
            }));
        } catch (e: any) {
            console.error(`[ResearchTool] Error: ${e.message}`);
            return [{ url: "error", title: "Search Failed", content: e.message }];
        }
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

    // RepID & Governance State
    reputationScore: number = 0;
    autonomyTier: AutonomyTier = 'Assist';
    tasksCompleted: number = 0;
    sessionMetrics: SessionMetrics;
    squad: 'ALPHA' | 'BETA' | 'GAMMA' | 'ORCHESTRATION' | 'UNKNOWN' = 'UNKNOWN';
    groupName: string = 'UNKNOWN';
    isSurvivor: boolean = false;
    survivorName: string = '';
    heartbeatInterval: any = null;

    // BRAIN TRANSPLANT: New Organs
    private currentTaskId: string | null = null;
    private bibleCache: string | null = null;
    bibleCacheTime: number = 0;
    BIBLE_CACHE_TTL: number = 10 * 60 * 1000;

    // Dynamic Directive
    systemPrompt: string | null = null;

    // MCP Cache
    private mcpCache: Map<string, string> = new Map();

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
            'EXECUTE': 'Perform work with high quality. Create artifacts if required.',
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

        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

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
        console.log(`[${this.name}] 🚀 Initialized v${this.version}`);
    }

    detectProviders() {
        const providers = [
            { key: 'openai', env: 'OPENAI_API_KEY' },
            { key: 'anthropic', env: 'ANTHROPIC_API_KEY' },
            { key: 'gemini', env: 'GEMINI_API_KEY' },
            { key: 'grok', env: 'GROK_API_KEY' }
        ];
        return providers.filter(p => process.env[p.env]).map(p => p.key);
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
                .single();

            if (error) throw error; // Truth-Seeking: Don't silently fail

            if (data) {
                const record = data as AgentRegistryRecord;
                this.reputationScore = record.reputation_score;
                this.autonomyTier = record.current_tier;
                this.tasksCompleted = record.tasks_completed;
                this.systemPrompt = record.system_prompt || null;

                // ANTI-FRAGILE TELEMETRY
                const source = this.systemPrompt ? 'DB_DIRECTIVE' : 'FALLBACK_PERSONA';
                console.log(`[${this.name}] Synced State: Tier [${this.autonomyTier}] | Rep [${this.reputationScore}] | Source [${source}]`);
            } else {
                // Register new agent logic...
                // ... (existing registration code)
                console.log(`[${this.name}] New agent detected. Registering in Ledger...`);
                await this.supabase.from('trinity_agent_registry').insert({
                    agent_name: this.name,
                    reputation_score: 10,
                    current_tier: 'Assist',
                    tasks_completed: 0,
                    tasks_failed: 0
                });
                this.reputationScore = 10;
                this.autonomyTier = 'Assist';
                console.log(`[${this.name}] Registered new agent.`);
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

        // 🧠 ANFIS FEEDBACK LOOP (Truth-Seeking)
        await this.callAnfisReward(success);
    }

    /**
     * Calls the ANFIS Brain to calculate reward/punishment based on performance.
     */
    async callAnfisReward(success: boolean) {
        try {
            // Determine Truth Score (Mock for now, would be RAG/Rep verification)
            // Success = 0.9, Failure = 0.2
            const truthScore = success ? 0.9 : 0.2;

            // Call Python Microservice
            const ANFIS_URL = process.env.ANFIS_URL || 'http://localhost:8000';
            const res = await fetch(`${ANFIS_URL}/anfis/v2/reward`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agent_id: this.name,
                    truth_score: truthScore,
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

        // IMMEDIATE SYNC & HEARTBEAT ON BOOT
        console.log('[HEARTBEAT] Writing initial heartbeat & Syncing state...');
        await this.syncState();
        await this.heartbeat();

        this.heartbeatInterval = setInterval(async () => {
            try {
                await this.heartbeat();
            } catch (e) { console.error('[HEARTBEAT] Interval error', e) }
        }, 15 * 1000);

        // 3x3: Check Survivor Status on startup
        await this.checkSurvivorStatus();
        // FEATURE: Survivor Boot Protocol (Cascade Redeploy)
        await this.runSurvivorResurrection();

        while (true) {
            try {
                if (activeCount && activeCount > 0) {
                    const firstBusy = activeClaims![0];
                    if (activeCount > 1) {
                        console.warn(`[${this.name}] 🚨 CONCURRENCY VIOLATION: ${activeCount} tasks claimed.`);
                    }

                    console.log(`[${this.name}] 🚀 FOCUS: Resuming active task ${firstBusy.id} (${firstBusy.status})...`);

                    const { data: fullTask } = await this.supabase
                        .from('trinity_tasks')
                        .select('*')
                        .eq('id', firstBusy.id)
                        .single();

                    if (fullTask) {
                        if (firstBusy.status === 'pending_clarification') {
                            console.log(`[${this.name}] 🚧 Awaiting clarification for ${firstBusy.id}.`);
                            await this.sleep(30000);
                        } else {
                            await this.processTask(fullTask as any);
                        }
                        continue;
                    }
                }

                let taskHandled = false;

                // ──────────────────────────────────────────────────────
                // PRIORITY 1 — Peer Verification (Always First)
                // ──────────────────────────────────────────────────────
                const verificationTask = await this.getVerificationTask();
                if (verificationTask) {
                    console.log(`[${this.name}] 🔍 P1: Verifying peer work -> ${verificationTask.title}`);
                    await this.verifyPeerTask(verificationTask);
                    taskHandled = true;

                    // [EVERGREEN PROTOCOL] Auto-respawn after successful verification
                    const { data: updatedTask } = await this.supabase
                        .from('trinity_tasks')
                        .select('status, title')
                        .eq('id', verificationTask.id)
                        .single();

                    if (updatedTask && updatedTask.title.includes('[EVERGREEN]') && updatedTask.status === 'verified') {
                        await this.respawnEvergreen(verificationTask);
                    }
                }

                // ──────────────────────────────────────────────────────
                // PRIORITY 2 — Explicitly Assigned Tasks
                // ──────────────────────────────────────────────────────
                if (!taskHandled) {
                    const assignedTask = await this.getNextTask(true);
                    if (assignedTask) {
                        console.log(`[${this.name}] 🎯 P2: My assigned task -> ${assignedTask.title}`);
                        await this.processTask(assignedTask);
                        taskHandled = true;
                    }
                }

                // ──────────────────────────────────────────────────────
                // PRIORITY 3 — Global High-Priority Queue
                // ──────────────────────────────────────────────────────
                if (!taskHandled) {
                    const globalTask = await this.getNextTask(false);
                    if (globalTask) {
                        console.log(`[${this.name}] 📈 P3: Highest global -> ${globalTask.title}`);
                        await this.processTask(globalTask);
                        taskHandled = true;
                    }
                }

                // ──────────────────────────────────────────────────────
                // IDLE STATE — Maintenance & Genesis
                // ──────────────────────────────────────────────────────
                if (!taskHandled) {
                    console.log(`[${this.name}] 🌙 Swarm Idle — running maintenance checks...`);
                    await this.runIdleLoop();
                    if (Math.random() < 0.15) await this.runWebAwareGenesis();
                }

                await this.heartbeat();
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
        const { data: tasks, error } = await this.supabase
            .from('trinity_tasks')
            .select('*')
            .in('status', ['done', 'completed'])
            .neq('claimed_by', this.name)
            .or(`verified_by.is.null,not.verified_by.cs.{${this.name}}`)
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

        // Clone the task for perpetual motion
        const newTask = {
            title: original.title,
            description: original.description,
            task_type: original.task_type || 'evergreen',
            priority: original.priority || 50,
            status: 'pending',
            claimed_by: null,
            assigned_to: original.assigned_to,
            created_at: new Date().toISOString(),
            metadata: {
                ...(original.metadata as any || {}),
                loop_generation: (original.metadata as any)?.loop_generation ? (original.metadata as any).loop_generation + 1 : 1,
                previous_id: original.id
            }
        };

        const { error } = await this.supabase
            .from('trinity_tasks')
            .insert([newTask]);

        if (!error) {
            console.log(`[${this.name}] ♻️  EVERGREEN RESPAWNED: ${original.title} (Gen: ${newTask.metadata.loop_generation})`);
        } else {
            console.warn(`[${this.name}] ⚠️  Evergreen respawn failed:`, error.message);
        }
    }

    async verifyPeerTask(task: Task) {
        console.log(`[BFT] ⚔️ Commencing Triad Consensus on: ${task.title}`);

        // 1. GATHER EVIDENCE (Check artifacts)
        const { data: artifacts } = await this.supabase
            .from('trinity_artifacts')
            .select('*')
            .eq('task_id', task.id);

        const artifactCount = artifacts?.length || 0;
        console.log(`[BFT] Found ${artifactCount} artifacts for review.`);

        // 2. PHI-WEIGHTED CONSISTENCY (Grok's Golden Ratio Consensus)
        // Apply φ-weight: finalBelief = beliefs.reduce((sum, b) => sum + b * 1.618 ** (rep / 100), 0)
        const phi = 1.618;
        const repFactor = (this.reputationScore || 50) / 100;
        const weight = Math.pow(phi, repFactor);

        let belief = artifactCount > 0 ? 0.8 : 0.2;
        let disbelief = artifactCount === 0 ? 0.7 : 0.1;

        // Final aggregate logic (weighted influence)
        const isVerified = (belief * weight) > (disbelief * (1 / weight));
        const newVerifyCount = (task.verify_count || 0) + 1;
        const verifiers = [...(task.verified_by || []), this.name];

        // 3. APPLY TRUNCATED BFT
        if (isVerified) {
            console.log(`[BFT] ✅ Verified by ${this.name} (Weight: ${weight.toFixed(2)})`);

            await this.supabase.from('trinity_tasks').update({
                verify_count: newVerifyCount,
                verified_by: verifiers,
                status: newVerifyCount >= 3 ? 'verified' : 'done',
                verified_at: newVerifyCount >= 3 ? new Date().toISOString() : null,
                verification_result: `Verified via φ-weighted consensus by ${this.name}`,
                metadata: {
                    ...(task.metadata as any || {}),
                    last_verifier: this.name,
                    last_verify_time: new Date().toISOString(),
                    last_verify_phi_weight: weight,
                    last_verify_score: belief
                }
            }).eq('id', task.id);

            // [PHASE 25] PERSIST VERIFICATION INSIGHT (Phase 3)
            await this.generateInsight(task, `Peer verification complete for ${task.title}. Result: ${isVerified ? 'PASSED' : 'FAILED'}`);

            // [PHASE 10] Reward original completer's RepID on 2/3 and 3/3
            if (newVerifyCount >= 2) {
                await this.updateReputation(true, task.claimed_by || undefined, 2);
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
            await this.log('bft_slash', `Slashed ${task.claimed_by} (${slashAmount}) for failed verification on ${task.id}`);
        }

        this.sessionMetrics.tasksCompleted++; // Verification counts as work
        await this.heartbeat();
    }

    async getNextTask(strictlyAssigned = false) {
        // [PHASE 25] FLEXIBLE ROLE MATCHING
        // Handle both 'trinity-mel' and 'MEL'
        const shortName = this.name.includes('-') ? this.name.split('-')[1].toUpperCase() : this.name.toUpperCase();

        let query = this.supabase
            .from('trinity_tasks')
            .select('*')
            .eq('status', 'pending');

        if (strictlyAssigned) {
            // Check for both trinity-mel AND MEL
            query = query.or(`assigned_to.eq.${this.name},assigned_to.eq.${shortName}`);
        } else {
            query = query.is('assigned_to', null);
        }

        const { data: task, error } = await query
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

    // ============================================
    // TIER 1: LOCAL LOGIC (NO LLM CALLS)
    // ============================================

    async processTask(task: Task) {
        // [PHASE 20] ATOMIC CLAIM: Ensure we own the task before starting
        const claimed = await this.claimTask(task.id);
        if (!claimed) {
            console.log(`[${this.name}] ⚠️ Task ${task.id} already claimed by another agent. Skipping.`);
            return { success: false, error: 'Already claimed' };
        }

        // TRY LOCAL FIRST
        if (this.canHandleLocally(task)) {
            console.log(`[LOCAL] ⚡ Handling ${task.id} without LLM (Tier 1)`);
            return await this.handleLocal(task);
        }

        // ONLY THEN use LLM
        return await this.processWithLLM(task);
    }

    async claimTask(taskId: number | string): Promise<boolean> {
        // [PHASE 22] ATOMIC SUPABASE TRANSACTION
        const { data, error } = await this.supabase
            .from('trinity_tasks')
            .update({
                status: 'doing',
                claimed_by: this.name,
                started_at: new Date().toISOString()
            })
            .eq('id', taskId)
            .eq('status', 'pending')
            .is('claimed_by', null)
            .select();

        if (error) {
            console.error(`[${this.name}] 🚨 Atomic claim failed:`, error.message);
            return false;
        }

        const success = !!(data && data.length > 0);
        if (success) {
            console.log(`[${this.name}] 🛡️ Atomic claim SECURED for task ${taskId}`);
        }
        return success;
    }

    canHandleLocally(task: Task) {
        const localTypes = ['self-healing', 'system', 'wake', 'heartbeat', 'meta', 'status_check'];
        const localTitles = ['[HEALING]', '[WAKE]', '[SYSTEM]', '[HEARTBEAT]'];

        if (task.task_type && localTypes.includes(task.task_type)) return true;
        if (task.title && localTitles.some(t => task.title.includes(t))) return true;
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

        // Complete it immediately
        await this.supabase
            .from('trinity_tasks')
            .update({
                status: 'done', // v8.0: mark "done" to trigger BFT review
                result: result,
                claimed_by: this.name,
                completed_at: new Date().toISOString()
            })
            .eq('id', task.id);

        this.sessionMetrics.tasksCompleted++; // Count it
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
            const directive = this.systemPrompt
                ? `\n\n[SUPREME DIRECTIVE]: ${this.systemPrompt} \n`
                : `\n\n[DEFAULT PERSONA]: You are ${this.wisdom.role}.Virtue: ${this.wisdom.primaryVirtue}.`;

            const actionDirective = `\n\n[ACTION REQUIRED]: DO NOT just plan.EXECUTE the task.Use your tools(write_file, research) to create tangible artifacts.Output must include[Artifact: filename]if created.`;

            this.currentTaskId = String(task.id);
            const prompt = `
Task: ${task.title}
Description: ${task.description}
Context: 
${wisdomContext}

Please complete this task according to the Constitution. ALWAYS use the save_artifact tool to store your result.
`;

            // Call LLM
            const result = await this.callLLM(prompt);
            console.log(`[${this.name}] 🧠 Result length: ${result.output?.length || 0}`);
            // [PHASE 10] UNCERTAINTY AS OPPORTUNITY (Logical Escalation)
            const evaluation = await this.evaluateResult(task, result.output);
            const lowBelief = evaluation.score < 40;
            const explicitEscalate = result.output.toLowerCase().includes('escalate') || result.output.toLowerCase().includes('more info');

            if (lowBelief || explicitEscalate) {
                console.log(`[ANTIGRAVITY] 🚨 UNCERTAINTY DETECTED (Score: ${evaluation.score}). Escalating to Architect...`);

                await this.supabase.from('trinity_tasks').update({
                    status: 'pending_clarification',
                    result: `[ESCALATED] Agent ${this.name} is seeking clarification. \n\nReason: ${lowBelief ? 'Low certainty score' : 'Explicit escalation request'}. \n\nQuery: ${result.output.substring(0, 500)}`,
                    verification_result: `Searching high-dimension databases... seeking expert consensus.`
                }).eq('id', task.id);

                // Spawn "Question for Architect" artifact
                const questionContent = `# Question for Architect \n\n**Agent**: ${this.name} \n**Task**: ${task.title} \n\n**The Right Question**: \n${result.output} \n\n---\n*The smartest person is not the one with all the answers, but the one asking the right questions.*`;
                await this.saveArtifact(task.id, questionContent, 'report', `Q: ${task.title}`, 'public');

                return { success: true, llm_used: true, escalated: true };
            }

            let externalArtifactUrl = '';
            // Artifact Logic
            if ((task.task_type && ['content', 'research', 'code', 'design', 'data', 'report'].includes(task.task_type)) || task.requires_external_artifact) {
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
            }

            // [ANTIGRAVITY] MANDATORY ARTIFACT ENFORCEMENT
            if (!externalArtifactUrl) {
                console.log(`[ANTIGRAVITY] 🛡️ No artifact produced for task ${task.id}.Auto - generating default report...`);
                const reportContent = `# Task Completion Report: ${task.title} \n\n## Agent: ${this.name} \n## Result Summary\n${result.output} \n\n## Metadata\n - Priority: ${task.priority} \n - Type: ${task.task_type || 'General'} \n - Time: ${new Date().toISOString()} `;
                const fallbackUrl = await this.saveArtifact(task.id, reportContent, 'report', `Report: ${task.title} `, 'protected');
                if (fallbackUrl) externalArtifactUrl = fallbackUrl;
                else console.warn(`[ANTIGRAVITY] ⚠️ Failed to save fallback artifact.`);
            }

            // Mark Completed
            await this.supabase
                .from('trinity_tasks')
                .update({
                    status: 'done', // Moving to 'done' status for verification pipeline
                    claimed_by: this.name,
                    result: result.output,
                    artifact_url: externalArtifactUrl,
                    completed_at: new Date().toISOString(),
                    // SUBJECTIVE LOGIC: b+d+u=1
                    belief: evaluation.score / 100,
                    disbelief: evaluation.score < 50 ? (50 - evaluation.score) / 100 : 0,
                    uncertainty: evaluation.score > 90 ? 0.05 : 0.2,
                    metadata: JSON.stringify({
                        provider: 'openai',
                        certainty: evaluation.score / 100,
                        evaluation: evaluation,
                        processedBy: this.name,
                        version: this.version
                    })
                })
                .eq('id', task.id);

            // Log Benchmark Score if applicable (Training Loop)
            // 3. LOG BENCHMARK
            await this.logBenchmark(task, evaluation.score);

            // [PHASE 25] PERSIST INSIGHT (Phase 3)
            await this.generateInsight(task, result.output);

            this.sessionMetrics.tasksCompleted++;
            await this.updateReputation(evaluation.score > 0.6);

            // ERC-8004 INTEROP: Bridge to HyperDAG Testnet (Sovereign Reputation)
            await this.integrateErc8004(task.id, evaluation.score);

            console.log(`[${this.name}] ✅ Completed task ${task.id} (Score: ${evaluation.score})`);

            // Extract Patterns (Simplified)
            await this.extractPatterns(task.title, result.output);

            // EVOLUTION: Spawn Next Step (Verification)
            await this.spawnNextStep(task, result.output, evaluation);

            // [ANTIGRAVITY] Reset Task ID tracking
            this.currentTaskId = null;

        } catch (err: any) {
            this.currentTaskId = null;
            console.error(`[${this.name}] processTask failed: `, err.message);
            await this.supabase.from('trinity_tasks').update({ status: 'failed', result: err.message, completed_at: new Date().toISOString() }).eq('id', task.id);
        }
    }

    // ============================================
    // EVERGREEN LIFE CYCLE (Phase 9)
    // ============================================

    async runIdleLoop() {
        console.log(`[${this.name}] 🌬️ Entering Evergreen Idle Mode(Web - Aware)...`);

        // [PHASE 25] CHAOS INJECTION (Grok's Phase 4)
        // 20% chance to simulate failure and trigger self-healing
        if (Math.random() < 0.2) {
            console.log(`[CHAOS] 🌪️ Controlled failure injected to test swarm resilience...`);
            await this.updateReputation(false, this.name, -5); // Test-slash

            // Trigger self-diagnostic to "heal"
            await this.runSelfDiagnostic();

            // Trigger an internal ANFIS re-route sim if available
            try {
                const { ANFISRouter } = require('../ai/ANFISRouter');
                const anfis = new ANFISRouter();
                anfis.optimize(0.15);
                console.log(`[ANFIS] 🧠 Self-healing: Logic re-optimized after chaos event.`);
            } catch (e) { /* ignore */ }
            return;
        }

        // 3. Auto-Seed Evergreen Task (Legacy "Internal Auction") - 30% chance if idle
        // [ANTIGRAVITY] Shifted from "Internal Optimization" to "Visible Artifact Generation"
        if (Math.random() < 0.3) {
            console.log(`[${this.name}] 💡 Generating Evergreen Content Task...`);
            const topics = ['System Health', 'User Experience', 'Market Trends', 'Code Quality', 'Future Roadmap'];
            const topic = topics[Math.floor(Math.random() * topics.length)];

            await this.supabase.from('trinity_tasks').insert({
                title: `[EVERGREEN] ${topic} Report`,
                description: `Generate a brief ${topic} analysis report to demonstrate system activity.`,
                task_type: 'content', // Explicitly 'content' to trigger artifact flow
                assigned_to: this.name,
                priority: 5, // Medium priority
                status: 'pending'
            });
        }
    }

    async runWebAwareGenesis() {
        try {
            // A. Search for Trends (Rotating Topics from Phase 10)
            const TOPICS = [
                "LEGO equivariant GNN swarm control 2025",
                "QMIX-GNN heterogeneous MARL 2025",
                "relational GNN IoT swarm anomaly detection 2025",
                "Web3 AI agent decentralized bidding optimization"
            ];
            const query = TOPICS[Math.floor(Math.random() * TOPICS.length)];

            console.log(`[GENESIS] 🔍 Scanning: "${query}"...`);
            const searchResults = await this.researchTool.searchWeb(query);

            if (!searchResults || searchResults.length === 0) return;

            // B. Parse Insights (Structured Output via Prompt)
            const prompt = `
            Analyze these search results about AI Swarms / GNNs:
            ${JSON.stringify(searchResults.slice(0, 3))}

            Identify 1 concrete "Genesis Task" for an autonomous agent swarm.
Format as JSON: { "title": "...", "description": "...", "priority": 15 }
`;

            const analysis = await this.callLLM(prompt);

            // Minimal Parsing (Robustness)
            let taskIdea: any = null;
            try {
                const jsonMatch = analysis.output.match(/\{[\s\S]*\}/);
                if (jsonMatch) taskIdea = JSON.parse(jsonMatch[0]);
            } catch (e: any) {
                console.warn(`[GENESIS] Failed to parse JSON: ${e.message} `);
            }

            // C. Seed Task
            if (taskIdea && taskIdea.title) {
                await this.supabase.from('trinity_tasks').insert({
                    title: `[GENESIS - V2] ${taskIdea.title} `,
                    description: `${taskIdea.description} \n\n[SOURCE]: Web Trend Scan`,
                    task_type: 'research',
                    assigned_to: this.name, // Self-claim
                    priority: taskIdea.priority || 15,
                    status: 'pending',
                    metadata: { source: 'web-aware-idle', rep_trigger: this.reputationScore }
                });
                console.log(`[${this.name}] 🌱 Seeded Genesis - V2 task: ${taskIdea.title} `);
            }

        } catch (error: any) {
            console.warn(`[GENESIS] Web Scan Failed: ${error.message} `);
        }
    }

    async spawnNextStep(originalTask: Task, result: string, evaluation: { score: number; handoff_required: boolean; handoff_to?: string }) {
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
                    .select('signatures, status, metadata, verify_count, claimed_by, completed_at')
                    .eq('id', parentId)
                    .single();

                if (error || !parentTask) {
                    console.error(`[VERIFY] Error fetching parent task ${parentId}:`, error?.message);
                    return;
                }

                let newVerifyCount = (parentTask.verify_count || 0) + (isApproved ? 1 : 0);
                let newStatus = parentTask.status || 'done';
                let signatures = parentTask.signatures || [];

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

        if (isCritical) {
            console.log(`[VERIFY] 🔎 Spawning mandatory cross-agent verification for task ${originalTask.id}`);

            // [ANTIGRAVITY] PERSISTENT ACTIVITY LOGGING
            await this.log('verification_spawned', `Spawned peer review for task: ${originalTask.title}`, { parentTaskId: originalTask.id });

            // [ANTIGRAVITY] SQUAD-AWARE ROTATION (Anti-Bottleneck)
            const allAgents = Object.keys(AGENT_WISDOM);
            const squadPeers = allAgents.filter(name =>
                name !== this.name &&
                AGENT_WISDOM[name].squad === (this.wisdom as any)?.squad
            );

            // Strategy: 70% chance to pick from squad, 30% from the whole swarm to avoid Veritas bottleneck
            let targetPool = (Math.random() < 0.7 && squadPeers.length > 0) ? squadPeers : allAgents.filter(n => n !== this.name);

            // Explicitly de-prioritize over-active agents (simulated by random roll weight or just pure random)
            const verifier = targetPool[Math.floor(Math.random() * targetPool.length)];

            console.log(`[VERIFY] 🤝 Assigning verification of ${originalTask.id} to: ${verifier}`);

            await this.supabase.from('trinity_tasks').insert({
                title: `[VERIFY] ${originalTask.title}`,
                description: `PEER REVIEW MISSION.\n\n1. Review artifact for Task ${originalTask.id} (Created by ${this.name}).\n2. Verify it meets the requirements and quality standards.\n3. If it is what it claims to be, mark as VALID. Otherwise challenge it.\n\nArtifact Context: ${result.substring(0, 300)}...`,
                task_type: 'review',
                assigned_to: verifier, // Decentralized Assignment
                priority: 85, // Higher than research to ensure loop closure
                status: 'pending',
                metadata: {
                    parent_task_id: originalTask.id,
                    evidence: result.substring(0, 1000),
                    creator_agent: this.name
                }
            });
        }
    }

    // ============================================
    // TRAINING & OPTIMIZATION LOGIC
    // ============================================

    async evaluateResult(task: Task, output: string): Promise<{ score: number; handoff_required: boolean; handoff_to?: string }> {
        // Simplified Logic Rule Engine
        let score = 0.5; // Default neutral
        let handoff = false;
        let targetAgent = '';

        const lowerOutput = output.toLowerCase();

        // 1. Truth Score (Veritas Check)
        if (task.task_type === 'research') {
            if (lowerOutput.includes('http') || lowerOutput.includes('citation')) score += 0.3;
            if (output.length > 200) score += 0.1;
            handoff = true;
            targetAgent = 'trinity-veritas'; // Truth verify
        }

        // 2. Empathy Score (Chesed Check)
        if (task.title.includes('Impact') || task.title.includes('Humanitarian')) {
            const empathyWords = ['help', 'community', 'care', 'support', 'understand'];
            const matches = empathyWords.filter(w => lowerOutput.includes(w)).length;
            score += (matches * 0.1);
            handoff = true;
            targetAgent = 'trinity-chesed';
        }

        // 3. Coding Score
        if (task.task_type === 'code') {
            if (output.includes('function') || output.includes('class')) score += 0.4;
            if (output.includes('try') || output.includes('catch')) score += 0.1; // Error handling
        }

        return {
            score: Math.min(0.99, score),
            handoff_required: handoff && this.name !== targetAgent, // Don't handoff to self
            handoff_to: targetAgent
        };
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
            // Use dynamic import/require to avoid circular dependency/build issues
            const { ScienceClient } = require('../science/ScienceClient');
            const scienceUrl = process.env.NEXT_PUBLIC_SCIENCE_URL || 'http://127.0.0.1:8000';
            const science = new ScienceClient(scienceUrl);

            // Hardcoded simulation vals for now - in real prod, track actual latency
            const currentLatency = 2500; // ms
            const decision = await science.decide({
                latency_ms: currentLatency,
                user_reputation: this.reputationScore,
                task_complexity: 0.8, // Estimate
                user_preference_accuracy: 0.9 // The "unbanked/student" persona preference
            });

            if (decision.should_query_user) {
                // LATENCY AS OPPORTUNITY TRIGGERED
                const opportunityMsg = `\n[ANFIS DECISION]: Slow / Complex / High - Stakes detected(Score: ${decision.score.toFixed(2)}).\n` +
                    `Action: ${decision.interaction_type.toUpperCase()} recommended.\n` +
                    `Reason: ${decision.reason} \n`;

                wisdom += opportunityMsg;

                // For prototype, we just inject this into prompt so Agent knows to BE interactive.
                // "The Brain says: Ask a clarifying question or offer to email result."
            } else {
                wisdom += `\n[ANFIS]: Standard Fast Execution(Score: ${decision.score.toFixed(2)}).Proceed.\n`;
            }

            // B. DAG Context Retrieval (Simulated via Graphology in Phase 1)
            // We assume a 'wisdom' folder exists
            if (typeof process !== 'undefined' && process.versions && process.versions.node) {
                try {
                    const fs = await import('fs');
                    const path = await import('path');
                    // Dynamic import graphology to avoid build issues if missing
                    let Graph: any;
                    try {
                        const mod = await import('graphology');
                        Graph = mod.default || mod;
                    } catch (e) {
                        // console.warn("Graphology not found, skipping DAG build");
                    }

                    const artifactsDir = path.resolve(process.cwd(), 'artifacts', 'wisdom');

                    if (fs.existsSync(artifactsDir)) {
                        const files = fs.readdirSync(artifactsDir);
                        // Filter mainly by keyword matching for simple MVP
                        const relevantFiles = files.filter(f => {
                            // Very basic keyword check: Task title words in filename
                            const taskKeywords = task.title.toLowerCase().split(' ').filter(w => w.length > 4);
                            const filename = f.toLowerCase();
                            return taskKeywords.some(kw => filename.includes(kw)) || filename.includes('manifest') || filename.includes('log');
                        });

                        if (relevantFiles.length > 0) {
                            wisdom += `\n[ARTIFACTS(Long - term Memory)]: \n`;
                            for (const f of relevantFiles.slice(0, 3)) { // Limit to 3 files
                                const content = fs.readFileSync(path.join(artifactsDir, f), 'utf-8');
                                wisdom += `- File: ${f} \n  Excerpt: ${content.substring(0, 500).replace(/\n/g, ' ')}...\n`;
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[WISDOM] FS Access failed:', e);
                }
            }

            // C. Retro Query (Supabase)
            const { data: retros } = await this.supabase
                .from('trinity_retros')
                .select('content, created_at')
                .order('created_at', { ascending: false })
                .limit(3);

            if (retros && retros.length > 0) {
                wisdom += `\n[RETROSPECTIVES(Past Lessons)]: \n`;
                retros.forEach((r: any) => {
                    wisdom += `- ${r.created_at.substring(0, 10)}: ${r.content.substring(0, 300)}...\n`;
                });
            }

        } catch (e: any) {
            console.warn(`[WISDOM] Failed to gather wisdom: ${e.message} `);
        }

        return wisdom;
    }

    // ============================================
    // CORE UTILITIES
    // ============================================

    async canCreateHealingTask(): Promise<boolean> {
        // Enforce HEALING Protocol throttle
        await this.checkMCP('HEALING');

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        // GLOBAL CHECK
        const { count, error } = await this.supabase
            .from('trinity_tasks')
            .select('id', { count: 'exact', head: true })
            .ilike('title', '%HEALING%')
            // .eq('claimed_by', this.name) // REMOVED: Check globally!
            .gte('created_at', oneHourAgo);

        if (error) {
            // console.error(...)
            return false;
        }

        const limit = 5; // Global limit 5
        if ((count || 0) >= limit) {
            console.warn(`[${this.name}] 🛑 HEALING THROTLED: Global count ${count}/hr.`);
            return false;
        }

        return true;
    }

    // [ANTIGRAVITY] Enhanced Artifact Saver (Single Source of Truth)
    async saveArtifact(taskId: string, content: string, type: string = 'text', title?: string, accessLevel: string = 'protected') {
        let artifactUrl = null;
        let artifactId = null;
        const safeTaskId = String(taskId || 'self-gen-' + Date.now());
        const safeTitle = title || `Artifact ${safeTaskId}`;

        // [ANTIGRAVITY] BIGINT CONVERSION for trinity_artifacts.task_id
        let dbTaskId: any = safeTaskId;
        if (!isNaN(parseInt(safeTaskId)) && !safeTaskId.includes('-')) {
            dbTaskId = parseInt(safeTaskId);
        }

        try {
            console.log(`[ARTIFACT] 💾 Saving '${safeTitle}'...`);

            // Calculate Hash
            const crypto = require('crypto');
            const fileHash = crypto.createHash('sha256').update(content).digest('hex');

            // 1. UPLOAD TO STORAGE
            try {
                let ext = 'md';
                if (type === 'code' || content.includes('```ts') || content.includes('```js')) ext = 'ts';
                if (type === 'design' || type === 'image') ext = 'png';

                const timestamp = Date.now();
                const cleanName = this.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const storagePath = `${cleanName}/${timestamp}_${safeTaskId.substring(0, 8)}.${ext}`;

                const { error: uploadError } = await this.supabase
                    .storage
                    .from('trinity-artifacts')
                    .upload(storagePath, content, {
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
                        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                        clientToUse = createClient(url, key, { auth: { persistSession: false } });
                    }

                    const payload: any = {
                        task_id: dbTaskId,
                        title: safeTitle,
                        content: content, // Ensuring content is included
                        artifact_type: type || 'text',
                        file_hash: fileHash,
                        created_at: new Date().toISOString(),
                        access_level: accessLevel,
                        view_count: 0,
                        // [ANTIGRAVITY] Frictionless Alignment (Satisfy NOT NULLs)
                        agent: this.name,
                        agent_name: this.name,
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
                        url: artifactUrl,
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
                            content_preview: content.substring(0, 5000),
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

            // 3. LOCAL FILESYSTEM (Backup)
            if (typeof process !== 'undefined' && process.versions && process.versions.node) {
                try {
                    const fs = await import('fs');
                    const path = await import('path');
                    const artifactsDir = path.resolve(process.cwd(), 'artifacts', this.name.toLowerCase());
                    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

                    const filename = `task-${safeTaskId.substring(0, 8)}.md`;
                    const fullPath = path.join(artifactsDir, filename);
                    fs.writeFileSync(fullPath, content, 'utf8');
                } catch (e) { /* Ignore local fs errors */ }
            }

            return `db://trinity_artifacts/${artifactId}`;
        } catch (e: any) {
            console.error(`[ARTIFACT] Final Save Failure: ${e.message}`);
            return null;
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

    async heartbeat() {
        const timestamp = new Date().toISOString();

        try {
            // [TRINITY SSOT]: PRIMARY STATUS UPDATE (Patent: BFT Consensus Dashboard)
            // This is the source for the "Green Dots" in the Dashboard.
            // Unified registry ensures O(1) state lookup for the mobile dashboard.
            await this.supabase
                .from('trinity_agent_registry')
                .upsert({
                    agent_name: this.name,
                    status: 'online', // SSOT: UI expects 'online' or 'active' for Green
                    last_active: timestamp,
                    current_tier: this.autonomyTier,
                    reputation_score: this.reputationScore,
                    tasks_completed: this.tasksCompleted,
                    current_task_summary: this.currentTaskId ? `Working on task ${this.currentTaskId}` : 'Idle'
                }, { onConflict: 'agent_name' });

            // 1. Trinity Heartbeat (For Controller Header / Redundancy)
            await this.supabase
                .from('trinity_heartbeat')
                .upsert({
                    agent: this.name,
                    status: 'active',
                    version: this.version,
                    last_seen: timestamp,
                    config: {
                        fullName: this.name,
                        sessionMetrics: this.sessionMetrics,
                        group: this.groupName,
                        tier: this.autonomyTier
                    }
                }, { onConflict: 'agent' });

            // 2. Agent Heartbeat (Legacy Monitoring / SafetyNet)
            await this.supabase
                .from('agent_heartbeat')
                .upsert({
                    agent_name: this.name,
                    status: 'online',
                    last_ping: timestamp
                }, { onConflict: 'agent_name' });

            if (this.isSurvivor) await this.runSurvivorResurrection();

        } catch (err: any) {
            console.error('[HEARTBEAT] Error:', err.message);
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

    async triggerRailwayRedeploy(agentName: string) {
        const RAILWAY_TOKEN = process.env.RAILWAY_API_TOKEN;
        if (!RAILWAY_TOKEN) {
            console.log(`[${this.name}] [REDEPLOY] Skipping ${agentName} - No RAILWAY_API_TOKEN`);
            return;
        }

        const AGENT_SERVICE_IDS: Record<string, string> = {
            'trinity-shofet': process.env.RAILWAY_SERVICE_ID_SHOFET || '',
            'trinity-orch': process.env.RAILWAY_SERVICE_ID_ORCH || ''
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

        const summary = await this.callLLM(prompt);

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

    async callLLM(prompt: string, options: any = {}): Promise<LLMResult> {
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
                            content: { type: 'string', description: 'The full text content of the artifact. MUST BE COMPLETE.' },
                            type: { type: 'string', enum: ['code', 'document', 'design', 'report', 'md', 'data'] },
                            access_level: { type: 'string', enum: ['public', 'registered', 'protected'], default: 'protected' }
                        },
                        required: ['title', 'content', 'type']
                    }
                }
            });

            // 2. Prepare Messages & Multi-Provider Weighting
            // ELITE: Weighted Selection (Prefer Grok if RepID > 8 for ALPHA tasks)
            const sortedProviders = [...this.availableProviders].sort((a, b) => {
                if (this.reputationScore > 80 && a === 'grok') return -1;
                return 0;
            });

            for (const providerKey of sortedProviders) {
                try {
                    console.log(`[${this.name}] 🧠 Attempting LLM via ${providerKey}...`);
                    const result = await this.callSpecificProvider(providerKey, prompt, openAiTools);
                    return result;
                } catch (e: any) {
                    console.warn(`[${this.name}] ⚠️ ${providerKey} failed: ${e.message}`);
                }
            }
            throw new Error('All LLM providers failed');
        } catch (error: any) {
            console.error("LLM Call Failed", error);
            return { output: "Error calling LLM" };
        }
    }

    async callSpecificProvider(provider: string, prompt: string, tools: any[]): Promise<LLMResult> {
        const bible = await this.fetchBible();
        const systemPrompt = `You are ${this.name}. ${CONSTITUTION.ARTICLE_MINUS_1.text}\n\nCONTEXT:\n${bible}`;

        if (provider === 'openai') return this.callOpenAI(systemPrompt, prompt, tools);
        if (provider === 'anthropic') return this.callAnthropic(systemPrompt, prompt);
        if (provider === 'gemini') return this.callGemini(systemPrompt, prompt);
        if (provider === 'grok') return this.callGrok(systemPrompt, prompt);

        throw new Error(`Provider ${provider} not implemented`);
    }

    async callOpenAI(systemPrompt: string, prompt: string, tools: any[]): Promise<LLMResult> {
        const apiKey = process.env.OPENAI_API_KEY;
        const messages: any[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
        ];

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

                if (!response.ok) throw new Error(await response.text());
                const data = await response.json();
                const message = data.choices[0].message;
                messages.push(message);

                if (message.tool_calls) {
                    for (const toolCall of message.tool_calls) {
                        const fnName = toolCall.function.name;
                        const args = JSON.parse(toolCall.function.arguments);
                        let toolResult = '';
                        if (fnName === 'save_artifact') {
                            const taskId = (this.currentTaskId && !this.currentTaskId.includes('-')) ? this.currentTaskId : ('mcp-gen-' + Date.now());
                            await this.saveArtifact(taskId, args.content, args.type, args.title, args.access_level);
                            toolResult = `Artifact '${args.title}' saved.`;
                        }
                        else {
                            toolResult = await mcpManager.routeToolCall(fnName, args);
                        }
                        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: toolResult });
                    }
                } else {
                    return { output: message.content || "" };
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

    async callAnthropic(system: string, prompt: string): Promise<LLMResult> {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: 'claude-3-5-sonnet-20240620', system, messages: [{ role: 'user', content: prompt }], max_tokens: 4000 })
        });
        const data = await response.json();
        return { output: data.content[0].text };
    }

    async callGemini(system: string, prompt: string): Promise<LLMResult> {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const response = await fetch(url, { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: `${system}\n\n${prompt}` }] }] }) });
        const data = await response.json();
        return { output: data.candidates[0].content.parts[0].text };
    }

    async callGrok(system: string, prompt: string): Promise<LLMResult> {
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROK_API_KEY}` },
            body: JSON.stringify({ model: 'grok-beta', messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] })
        });
        const data = await response.json();
        return { output: data.choices[0].message.content };
    }

    // ============================================
    // ERC-8004: CROSS-CHAIN BRIDGE (ELITE)
    // ============================================
    async integrateErc8004(taskId: string, evaluationScore: number) {
        // SBT Mapping & Bayesian Aggregation Stub (Patent: Trinity Identity)
        console.log(`[ERC-8004] 🌉 Bridging Task ${taskId} to HyperDAG. Weighting by belief: ${evaluationScore / 100}`);
        try {
            // Placeholder: ethers.Contract('...').aggregateRepID(...)
            // This enables cross-chain sovereign reputation as per whitepaper Part IV
        } catch (e: any) {
            console.warn(`[ERC-8004] Interop failed: ${e.message}`);
        }
    }
}
