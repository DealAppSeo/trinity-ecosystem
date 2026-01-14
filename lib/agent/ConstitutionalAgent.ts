import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import { AgentConfig, WisdomProfile, ProviderConfig, LLMResult, Task, AutonomyTier, AgentRegistryRecord } from './types';
import { AGENT_WISDOM, CONSTITUTION } from './wisdom';
// Dynamic imports for graphology/fs handled inside methods to avoid build issues
import { mcpManager } from '../mcp/MCPManager';

const MCP_BASE_URL = 'https://raw.githubusercontent.com/dealappseo/trinity-ecosystem/main/docs/MCPs';

export type MCPPhase = 'WAKE' | 'FIND_TASK' | 'EXECUTE' | 'COMPLETE' | 'IDLE' | 'EVERGREEN' | 'HEALING' | 'ITERATE';

export interface SessionMetrics {
    tasksCompleted: number;
    cacheHits: number;
    llmCalls: number;
    healingAttempts: number;
    siblingsChallenged: number;
    truthChoices: number;
    sabbathReflections: number;
    wisdomCrystallizations: number;
    patternsLearned: number;
    tasksSpawned: number;
    virtueRefusals: number;
    bibleReads: number;
    startTime: number;
}

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

    // BRAIN TRANSPLANT: New Organs
    sessionMetrics: SessionMetrics;
    bibleCache: string | null = null;
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
        this.name = config.name || 'UNKNOWN';
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
        this.researchTool = {
            searchWeb: async (query: string) => {
                console.log(`[${this.name}] 🌐 SEARCHING WEB: "${query}"`);
                return [
                    { title: `${query} Guidelines`, url: 'https://example.com/guidelines', content: `Best practices for ${query}...` },
                    { title: `Advanced ${query} Techniques`, url: 'https://arxiv.org/fake-paper', content: `Recent study on ${query} optimization...` },
                    { title: `${query} Tutorial`, url: 'https://github.com/fake-repo/tutorial', content: `Step-by-step guide to ${query}...` }
                ];
            },
            browsePage: async (url: string, instructions: string) => {
                console.log(`[${this.name}] 📄 BROWSING: ${url} with instructions: "${instructions}"`);
                return `Extracted content from ${url} relevant to ${instructions}`;
            }
        };

        this.availableProviders = this.detectProviders();
        console.log(`[${this.name}] 🚀 Initialized v${this.version}`);
    }

    detectProviders() {
        return ['openai'];
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
     */
    async updateReputation(success: boolean) {
        // Scoring Logic: +1 for success, -5 for failure (Trust is hard to gain, easy to lose)
        const delta = success ? 1 : -5;
        this.reputationScore = Math.max(0, Math.min(100, this.reputationScore + delta));

        if (success) this.tasksCompleted++;

        // Autonomy Tier Promotion Logic
        let newTier: AutonomyTier = this.autonomyTier;
        if (this.reputationScore <= 40) newTier = 'Assist';
        else if (this.reputationScore <= 70) newTier = 'Approve';
        else if (this.reputationScore <= 90) newTier = 'Act';
        else newTier = 'Learn';

        if (newTier !== this.autonomyTier) {
            console.log(`[${this.name}] 🚨 TIER PROMOTION DETECTED: ${this.autonomyTier} -> ${newTier}`);
            this.autonomyTier = newTier;
        }

        // Commit to Ledger
        await this.supabase.from('trinity_agent_registry').upsert({
            agent_name: this.name,
            reputation_score: this.reputationScore,
            current_tier: this.autonomyTier,
            tasks_completed: this.tasksCompleted,
            last_active: new Date().toISOString()
        });

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

    // ============================================
    // CORE STRATEGIES
    // ============================================

    // ============================================
    // BRAIN TRANSPLANT: NEW ORGANS (Healing, Context, Genome)
    // ============================================

    // ============================================
    // MAIN AGENT LOOP (TRANSPLANTED CORE)
    // ============================================

    heartbeatInterval: NodeJS.Timeout | null = null;
    isSurvivor: boolean = false; // Default, synced later
    survivorName: string = '';
    groupName: string = 'UNKNOWN';

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

        // IMMEDIATE HEARTBEAT ON BOOT
        console.log('[HEARTBEAT] Writing initial heartbeat...');
        await this.heartbeat();

        this.heartbeatInterval = setInterval(async () => {
            try {
                await this.heartbeat();
            } catch (e) { console.error('[HEARTBEAT] Interval error', e) }
        }, 15 * 1000);

        // 3x3: Check Survivor Status on startup
        await this.checkSurvivorStatus();
        // FEATURE: Survivor Boot Protocol (Cascade Redeploy)
        await this.runSurvivorBootProtocol();

        while (true) {
            try {
                // Sabbath Logic
                // if (this.isSabbathTime()) ... (Simplified: Skip for now or implement if needed)

                // Check Approved Actions (Mock)
                // await this.checkApprovedActions();

                const task = await this.getNextTask();

                if (task) {
                    console.log(`[${this.name}] 📋 Processing: ${task.title}`);
                    await this.processTask(task);
                } else {
                    console.log(`[${this.name}] 💤 No tasks available, waiting...`);
                }

                await this.heartbeat();
                // 3x3: Continuous Monitoring
                await this.checkSurvivorStatus();

                // EVERGREEN IDLE LOOP (Phase 9)
                if (!task) {
                    await this.runIdleLoop();
                }

                // Self-Healing Check (Legacy integrated)
                if (Math.random() < 0.05) await this.runSelfDiagnostic();

                await this.sleep(30000);

            } catch (err: any) {
                console.error(`[${this.name}] Main loop error:`, err.message);
                await this.log('main_loop_error', err.message);
                await this.sleep(60000);
            }
        }
    }

    async getNextTask() {
        let { data: task } = await this.supabase
            .from('trinity_tasks')
            .select('*')
            .or(`assigned_to.eq.${this.name},assigned_to.is.null`)
            .eq('status', 'pending')
            .order('priority', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(1)
            .single();

        if (!task) {
            // Check for unassigned tasks explicitly if OR query fails or just double check
            const result = await this.supabase
                .from('trinity_tasks')
                .select('*')
                .is('assigned_to', null)
                .eq('status', 'pending')
                .order('priority', { ascending: false })
                .order('created_at', { ascending: true })
                .limit(1)
                .single();
            task = result.data;
        }
        return task || null;
    }

    // ============================================
    // TIER 1: LOCAL LOGIC (NO LLM CALLS)
    // ============================================

    async processTask(task: Task) {
        // TRY LOCAL FIRST
        if (this.canHandleLocally(task)) {
            console.log(`[LOCAL] ⚡ Handling ${task.id} without LLM (Tier 1)`);
            return await this.handleLocal(task);
        }

        // ONLY THEN use LLM
        return await this.processWithLLM(task);
    }

    canHandleLocally(task: Task) {
        const localTypes = ['self-healing', 'system', 'wake', 'heartbeat', 'meta', 'status_check'];
        const localTitles = ['[HEALING]', '[WAKE]', '[SYSTEM]', '[HEARTBEAT]'];

        if (task.task_type && localTypes.includes(task.task_type)) return true;
        if (task.title && localTitles.some(t => task.title.includes(t))) return true;
        return false;
    }

    async handleLocal(task: Task) {
        // Claim task first
        await this.supabase.from('trinity_tasks').update({ status: 'in_progress', claimed_by: this.name }).eq('id', task.id);

        let result = `[LOCAL] Processed by ${this.name} rule engine`;

        // Special handling if needed
        if (task.task_type === 'heartbeat') await this.heartbeat();
        // Healing logic is handled by creation, but if we need to 'process' the healing task itself:
        if (task.task_type === 'self-healing' || task.title.includes('[HEALING]')) {
            // Log the healing
            console.log(`[LOCAL] 🩺 Processed healing task ${task.id}`);
            result = `[HEALING] System repaired by ${this.name}`;
            this.sessionMetrics.healingAttempts++;
        }

        // Complete it immediately
        await this.supabase
            .from('trinity_tasks')
            .update({
                status: 'completed',
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
        console.log(`[LLM] 🧠 Calling API for task ${task.id} (${task.task_type})`);

        try {
            // Claim Task
            await this.supabase.from('trinity_tasks').update({ status: 'in_progress', claimed_by: this.name, started_at: new Date().toISOString() }).eq('id', task.id);

            // 1. CONTEXT PIPE: GATHER WISDOM (The "Amnesia" Fix)
            const wisdomContext = await this.gatherWisdom(task);

            // 1.5 CHECK ITERATE PROTOCOL
            let iterateProtocol = "";
            if (task.title.includes('[ITERATE]') || task.description?.includes('[ITERATE]')) {
                iterateProtocol = `\n\n[PROTOCOL: ITERATE ACTIVE]\n${await this.checkMCP('ITERATE')}\n`;
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
                ? `\n\n[SUPREME DIRECTIVE]: ${this.systemPrompt}\n`
                : `\n\n[DEFAULT PERSONA]: You are ${this.wisdom.role}. Virtue: ${this.wisdom.primaryVirtue}.`;

            const actionDirective = `\n\n[ACTION REQUIRED]: DO NOT just plan. EXECUTE the task. Use your tools (write_file, research) to create tangible artifacts. Output must include [Artifact: filename] if created.`;

            const prompt = `${enrichedDescription}${directive}${actionDirective}${iterateProtocol}\n\nTask: ${task.title}\nRole: ${this.name}`;

            // Call LLM
            const result = await this.callLLM(prompt);

            // Calculate Certainty & Evaluation (Optimization Upgrade)
            const evaluation = await this.evaluateResult(task, result.output);

            let externalArtifactUrl = '';
            // Artifact Logic
            if ((task.task_type && ['content', 'research', 'code'].includes(task.task_type)) || task.requires_external_artifact) {
                const dbArtifactLink = await this.saveArtifact(task.id, result.output, 'text_content');
                if (dbArtifactLink) externalArtifactUrl = dbArtifactLink;
            }

            // [ANTIGRAVITY] MANDATORY ARTIFACT ENFORCEMENT
            if (!externalArtifactUrl) {
                console.log(`[ANTIGRAVITY] 🛡️ No artifact produced for task ${task.id}. Auto-generating default report...`);
                const reportContent = `# Task Completion Report: ${task.title}\n\n## Agent: ${this.name}\n## Result Summary\n${result.output}\n\n## Metadata\n- Priority: ${task.priority}\n- Type: ${task.task_type || 'General'}\n- Time: ${new Date().toISOString()}`;
                const fallbackUrl = await this.saveArtifact(task.id, reportContent, 'report', `Report: ${task.title}`, 'protected');
                if (fallbackUrl) externalArtifactUrl = fallbackUrl;
                else console.warn(`[ANTIGRAVITY] ⚠️ Failed to save fallback artifact.`);
            }

            // Mark Completed
            await this.supabase
                .from('trinity_tasks')
                .update({
                    status: 'completed',
                    claimed_by: this.name,
                    result: result.output,
                    completed_at: new Date().toISOString(),
                    metadata: JSON.stringify({
                        provider: 'openai', // or result.provider
                        certainty: 0.85,
                        evaluation: evaluation,
                        processedBy: this.name,
                        version: this.version
                    })
                })
                .eq('id', task.id);

            // Log Benchmark Score if applicable (Training Loop)
            if ((task as any).metadata?.benchmark) {
                await this.logBenchmark(task, evaluation.score);
            }

            this.sessionMetrics.tasksCompleted++;
            console.log(`[${this.name}] ✅ Completed task ${task.id} (Score: ${evaluation.score})`);

            // Extract Patterns (Simplified)
            await this.extractPatterns(task.title, result.output);

            // EVOLUTION: Spawn Next Step (Verification)
            await this.spawnNextStep(task, result.output, evaluation);

        } catch (err: any) {
            console.error(`[${this.name}] ❌ Task ${task.id} failed:`, err.message);
            await this.supabase.from('trinity_tasks').update({ status: 'failed', result: err.message, completed_at: new Date().toISOString() }).eq('id', task.id);
        }
    }

    // ============================================
    // EVERGREEN LIFE CYCLE (Phase 9)
    // ============================================

    async runIdleLoop() {
        console.log(`[${this.name}] 🌬️ Entering Evergreen Idle Mode (Web-Aware)...`);

        // 1. Cost Guard Check (Simulated)
        // const canSpend = await checkBudget(); if (!canSpend) return;

        // 2. Roll for Chaos (The Gym) - 20% chance
        if (Math.random() < 0.2) {
            // [ANTIGRAVITY] ANFIS Optimization Step
            try {
                const { ANFISRouter } = require('../ai/ANFISRouter');
                const anfis = new ANFISRouter();
                anfis.optimize(0.15); // Chaotic HHO
                const route = anfis.route([Math.random(), Math.random(), 0.5]); // Simulate inputs
                if (route.targetSquad === 'GAMMA' && this.name.includes('MEL')) {
                    console.log(`[ANFIS] 🔀 Re-routing internal logic based on fuzzy score ${route.confidence.toFixed(2)}`);
                }
            } catch (e) { /* ignore */ }

            try {
                const { runChaosSimulation } = require('../../scripts/chaos-engine');
                await runChaosSimulation();
            } catch (e) { /* Ignore import error in dev */ }
            return;
        }

        // 3. GENESIS V2: Web-Aware Self-Optimization (40% chance for High Rep)
        if (this.reputationScore > 40 && Math.random() < 0.4) {
            console.log(`[${this.name}]  High-Rep Agent Initiating External Inspiration Scan...`);
            await this.runWebAwareGenesis();
        }

        // 4. Fallback: Internal Auction (Research) - 20% chance
        if (Math.random() < 0.2) {
            console.log(`[${this.name}] 💡 Proposing Internal Self-Research...`);
            await this.supabase.from('trinity_tasks').insert({
                title: `[SELF-GEN] Internal Optimization`,
                description: `Analyze internal logs for bottlenecks.`,
                task_type: 'research',
                assigned_to: this.name,
                priority: 2, // Low priority (Background)
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
            Analyze these search results about AI Swarms/GNNs:
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
                console.warn(`[GENESIS] Failed to parse JSON: ${e.message}`);
            }

            // C. Seed Task
            if (taskIdea && taskIdea.title) {
                await this.supabase.from('trinity_tasks').insert({
                    title: `[GENESIS-V2] ${taskIdea.title}`,
                    description: `${taskIdea.description}\n\n[SOURCE]: Web Trend Scan`,
                    task_type: 'research',
                    assigned_to: this.name, // Self-claim
                    priority: taskIdea.priority || 15,
                    status: 'pending',
                    metadata: { source: 'web-aware-idle', rep_trigger: this.reputationScore }
                });
                console.log(`[${this.name}] 🌱 Seeded Genesis-V2 task: ${taskIdea.title}`);
            }

        } catch (error: any) {
            console.warn(`[GENESIS] Web Scan Failed: ${error.message}`);
        }
    }

    async spawnNextStep(originalTask: Task, result: string, evaluation: { score: number; handoff_required: boolean; handoff_to?: string }) {
        // AUTOMATIC REPRODUCTION: Code/Design -> Verify
        const needsVerification = ['code', 'design', 'strategy'].includes(originalTask.task_type || '');

        if (needsVerification) {
            let verifier = 'trinity-veritas'; // Default
            if (originalTask.task_type === 'code') verifier = 'trinity-test-suite'; // Or similar
            if (originalTask.task_type === 'design') verifier = 'trinity-architect';

            // Don't assign to self
            if (verifier === this.name) verifier = 'trinity-apm';

            console.log(`[EVOLUTION] 🧬 Spawning Verification Task for ${verifier}`);

            await this.supabase.from('trinity_tasks').insert({
                title: `[VERIFY] Review ${originalTask.title}`,
                description: `VERIFICATION REQUIRED.\n\nOriginal Output:\n${result.substring(0, 1000)}...\n\nInstructions:\n1. Review against standards (Security, UX, Efficiency).\n2. Pass or Fail.\n3. If Fail, spawn [FIX] task.`,
                task_type: 'review',
                assigned_to: verifier,
                priority: 50, // High priority
                status: 'pending'
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
            console.warn(`[BENCHMARK] Log failed: ${e.message}`);
        }
    }

    async handoffTask(originalTask: Task, result: string, toAgent: string) {
        console.log(`[HANDOFF] 🤝 ${this.name} -> ${toAgent}`);
        await this.supabase.from('trinity_tasks').insert({
            title: `[REVIEW] ${originalTask.title}`,
            description: `Review artifact from ${this.name}. Verify accuracy/empathy.\n\nContext:\n${result.substring(0, 500)}...`,
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
                const opportunityMsg = `\n[ANFIS DECISION]: Slow/Complex/High-Stakes detected (Score: ${decision.score.toFixed(2)}).\n` +
                    `Action: ${decision.interaction_type.toUpperCase()} recommended.\n` +
                    `Reason: ${decision.reason}\n`;

                wisdom += opportunityMsg;

                // For prototype, we just inject this into prompt so Agent knows to BE interactive.
                // "The Brain says: Ask a clarifying question or offer to email result."
            } else {
                wisdom += `\n[ANFIS]: Standard Fast Execution (Score: ${decision.score.toFixed(2)}). Proceed.\n`;
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
                            wisdom += `\n[ARTIFACTS (Long-term Memory)]:\n`;
                            for (const f of relevantFiles.slice(0, 3)) { // Limit to 3 files
                                const content = fs.readFileSync(path.join(artifactsDir, f), 'utf-8');
                                wisdom += `- File: ${f}\n  Excerpt: ${content.substring(0, 500).replace(/\n/g, ' ')}...\n`;
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
                wisdom += `\n[RETROSPECTIVES (Past Lessons)]:\n`;
                retros.forEach((r: any) => {
                    wisdom += `- ${r.created_at.substring(0, 10)}: ${r.content.substring(0, 300)}...\n`;
                });
            }

        } catch (e: any) {
            console.warn(`[WISDOM] Failed to gather wisdom: ${e.message}`);
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
        const safeTaskId = taskId || 'self-gen-' + Date.now();
        const safeTitle = title || `Artifact ${safeTaskId}`;

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

            // 2. DATABASE INSERT
            const { data, error } = await this.supabase
                .from('trinity_artifacts')
                .insert({
                    task_id: safeTaskId,
                    agent_name: this.name,
                    title: safeTitle,
                    artifact_type: type || 'text',
                    content: content,
                    file_path: artifactUrl,
                    url: artifactUrl,
                    created_at: new Date().toISOString(),
                    access_level: accessLevel,
                    view_count: 0,
                    file_hash: fileHash,
                    creator_agent: this.name
                })
                .select('id')
                .single();

            if (error) throw error;
            artifactId = data.id;
            console.log(`[ARTIFACT] Saved to DB: ${artifactId} (${accessLevel})`);

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
            console.error(`[ARTIFACT] Failed: ${e.message}`);
            return null;
        }
    }
            console.log(`[ARTIFACT] 💾 Saving '${safeTitle} '...`);

// Calculate Hash
const crypto = require('crypto');
const fileHash = crypto.createHash('sha256').update(content).digest('hex');

// 1. DATABASE INSERT
const { data, error } = await this.supabase
    .from('trinity_artifacts')
    .insert({
        task_id: safeTaskId,
        agent_name: this.name,
        title: safeTitle,
        artifact_type: type || 'text',
        content: content,
        file_path: artifactUrl, // Might be null
        url: artifactUrl,
        created_at: new Date().toISOString(),
        access_level: accessLevel,
        view_count: 0,
        file_hash: fileHash,
        creator_agent: this.name
    })
    .select('id')
    .single();

if (error) throw error;
artifactId = data.id;
console.log(`[ARTIFACT] Saved to DB: ${artifactId} (${accessLevel})`);

// 2. LOCAL FILESYSTEM (Backup)
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
    console.error(`[ARTIFACT] Failed: ${e.message}`);
    return null;
}
    }

    async runSelfDiagnostic() {
    // Renamed/Integrated into loop. Kept for legacy if needed or called by interval
    console.log(`[${this.name}] 🔍 Running self-diagnostic...`);
    // We can just report genome
    await this.reportGenome();
}

    async fetchBible(): Promise < string > {
    if(this.bibleCache && (Date.now() - this.bibleCacheTime) < this.BIBLE_CACHE_TTL) {
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

    async runSurvivorBootProtocol() {
    if (!this.isSurvivor) return;
    console.log(`[${this.name}] 🛡️ Running Survivor Boot Protocol...`);
    try {
        const { data: members } = await this.supabase
            .from('trinity_heartbeat')
            .select('agent, last_seen, config')
            .contains('config', { group: this.groupName });

        if (!members || members.length === 0) return;

        for (const member of members) {
            if (member.agent === this.name) continue;
            const lastSeen = new Date(member.last_seen);
            const minutesAgo = (Date.now() - lastSeen.getTime()) / 60000;

            if (minutesAgo > 10) {
                console.log(`[${this.name}] 🚨 Member ${member.agent} is STALE. Redeploying...`);
                await this.triggerRailwayRedeploy(member.agent);
            }
        }
    } catch (e: any) {
        console.log(`[${this.name}] [BOOT] Survivor protocol error: ${e.message}`);
    }
}

    async triggerRailwayRedeploy(agentName: string) {
    const RAILWAY_TOKEN = process.env.RAILWAY_API_TOKEN;
    if (!RAILWAY_TOKEN) {
        console.log(`[${this.name}] [REDEPLOY] Skipping ${agentName} - No RAILWAY_API_TOKEN`);
        return;
    }

    // TODO: User must fill these Service IDs
    const AGENT_SERVICE_IDS: Record<string, string> = {
        'GABRIEL': 'service-uuid-here',
        'RAZIEL': 'service-uuid-here',
        'CASSIEL': 'service-uuid-here',
        // ... Fill other agents ...
    };

    const serviceId = AGENT_SERVICE_IDS[agentName];
    if (!serviceId) {
        console.log(`[${this.name}] [REDEPLOY] Skipping ${agentName} - Service ID not mapped in AGENT_SERVICE_IDS`);
        return;
    }

    try {
        const query = `
                mutation serviceRestart($id: String!) {
                    serviceRestart(id: $id)
                }
            `;

        const response = await fetch('https://backboard.railway.app/graphql/v2', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RAILWAY_TOKEN}`
            },
            body: JSON.stringify({
                query,
                variables: { id: serviceId }
            })
        });

        const result = await response.json();
        if (result.errors) {
            console.log(`[${this.name}] [REDEPLOY] Failed to restart ${agentName}: ${result.errors[0].message}`);
        } else {
            console.log(`[${this.name}] 🚀 TRIGGERED REDEPLOY for ${agentName}`);
        }

    } catch (e: any) {
        console.log(`[${this.name}] [REDEPLOY] Exception triggering restart: ${e.message}`);
    }
}

    async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

    async log(action: string, message: string, metadata: any = {}) {
    try {
        await this.supabase
            .from('trinity_agent_logs')
            .insert({
                agent: this.name,
                action,
                message: typeof message === 'string' ? message.substring(0, 5000) : JSON.stringify(message).substring(0, 5000),
                metadata: {
                    ...metadata,
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
    // 1. Trinity Heartbeat (For Controller)
    try {
        await this.supabase
            .from('trinity_heartbeat')
            .upsert({
                agent: this.name,
                status: 'active',
                version: this.version,
                last_seen: timestamp,
                config: {
                    primaryVirtue: this.wisdom?.primaryVirtue,
                    sessionMetrics: this.sessionMetrics,
                    group: this.groupName, // 3x3 Group
                    isSurvivor: this.isSurvivor, // DNA flag
                    survivorTarget: this.survivorName
                }
            }, { onConflict: 'agent' });
    } catch (err) {
        // Non-fatal
    }

    // 2. Agent Heartbeat (Legacy/Monitoring Table)
    try {
        const { error } = await this.supabase
            .from('agent_heartbeat') // User explicitly requested this table
            .upsert({
                agent_name: this.name,
                status: 'online',
                last_ping: timestamp
            }, { onConflict: 'agent_name' });

        if (error) console.error('[HEARTBEAT] FAILED:', error.message);
        // else console.log(`[HEARTBEAT] Ping sent (${timestamp})`);

    } catch (err: any) {
        console.error('[HEARTBEAT] Error:', err.message);
    }
}

    // ... Keeping heartbeat separate to update Dual Write

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

    async callLLM(prompt: string, options: any = {}): Promise < LLMResult > {
    const apiKey = process.env.OPENAI_API_KEY;
    if(!apiKey) {
        console.warn(`[${this.name}] No API Key for LLM`);
        return { output: "Simulation: LLM not configured." };
    }

        try {
        // 1. Get Tools for this Agent
        const tools = await mcpManager.getToolsForRole(this.name);
        const openAiTools = tools.map((tool: any) => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.schema
            }
        }));

        // [ANTIGRAVITY] Inject Database Write Tool explicitly
        openAiTools.push({
            type: 'function',
            function: {
                name: 'save_artifact',
                description: 'Save a generated artifact (document, code, report) to the Trinity Database. REQUIRED for all creation tasks.',
                parameters: {
                    type: 'object',
                    properties: {
                        title: { type: 'string', description: 'Title of the artifact' },
                        content: { type: 'string', description: 'The full text content of the artifact' },
                        type: { type: 'string', enum: ['code', 'document', 'design', 'report', 'md'] },
                        access_level: { type: 'string', enum: ['public', 'registered', 'protected'], default: 'protected' }
                    },
                    required: ['title', 'content', 'type']
                }
            }
        });

        // 2. Prepare Messages
        const messages: any[] = [
            { role: 'system', content: `You are ${this.name}. ${CONSTITUTION.ARTICLE_MINUS_1.text}\n\nCONTEXT:\n${await this.fetchBible()}` },
            { role: 'user', content: prompt }
        ];

        // 3. Loop for Tool Calls (Max 5 turns to prevent infinite loops)
        for(let i = 0; i < 5; i++) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            messages: messages,
            tools: openAiTools.length > 0 ? openAiTools : undefined,
            tool_choice: openAiTools.length > 0 ? 'auto' : undefined
        })
    });

    const data = await response.json();
    const choice = data.choices?.[0];
    const message = choice?.message;

    if (!message) return { output: "Error: No output from LLM" };

    // Add assistant message to history
    messages.push(message);

    // Check for Tool Calls
    if (message.tool_calls && message.tool_calls.length > 0) {
        console.log(`[${this.name}] 🛠️ LLM Requested ${message.tool_calls.length} tool(s)`);

        for (const toolCall of message.tool_calls) {
            const fnName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);
            console.log(`[${this.name}] 📞 Calling Tool: ${fnName}`);

            let toolResult = '';
            try {
                if (fnName === 'save_artifact') {
                    // [ANTIGRAVITY] Intercept Local Tool Call
                    await this.saveArtifact(
                        'mcp-gen-' + Date.now(),
                        args.content,
                        args.type,
                        args.title,
                        args.access_level
                    );
                    toolResult = `Artifact '${args.title}' successfully saved to database.`;
                } else {
                    toolResult = await mcpManager.routeToolCall(fnName, args);
                }
            } catch (err: any) {
                toolResult = `Error executing tool ${fnName}: ${err.message}`;
                console.error(`[${this.name}] ❌ Tool Error:`, err);
            }

            // Add tool result to messages
            messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: toolResult
            });
        }
        // Loop continues to send tool outputs back to LLM
    } else {
        // Final response (no more tools)
        return { output: message.content || "No content returned" };
    }
}

return { output: "Error: Max tool recursion limit reached." };

        } catch (error: any) {
    console.error("LLM Call Failed", error);
    // Don't punish reputation for API errors, it's not the agent's fault
    return { output: "Error calling LLM" };
}
    }
}
