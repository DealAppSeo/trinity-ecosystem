import { SupabaseClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import { AgentConfig, WisdomProfile, LLMResult, Task, AutonomyTier } from './types';
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
export interface ResearchTool {
    searchWeb(query: string): Promise<{
        url: string;
        title: string;
        content: string;
    }[]>;
    browsePage(url: string, instructions: string): Promise<string>;
}
export declare class WebResearchTool implements ResearchTool {
    searchWeb(query: string): Promise<{
        url: string;
        title: string;
        content: string;
    }[]>;
    browsePage(url: string, instructions: string): Promise<string>;
}
export declare class ConstitutionalAgent {
    name: string;
    wisdom: WisdomProfile;
    version: string;
    supabase: SupabaseClient;
    redis: Redis | null;
    availableProviders: string[];
    researchTool: ResearchTool;
    reputationScore: number;
    autonomyTier: AutonomyTier;
    tasksCompleted: number;
    sessionMetrics: SessionMetrics;
    private currentTaskId;
    private bibleCache;
    bibleCacheTime: number;
    BIBLE_CACHE_TTL: number;
    systemPrompt: string | null;
    private mcpCache;
    /**
     * MCP Protocol Loader
     * Fetches operational protocols from GitHub to enforce strict guidelines.
     */
    checkMCP(phase: MCPPhase): Promise<string>;
    private getFallbackMCP;
    constructor(config: AgentConfig);
    detectProviders(): string[];
    /**
     * Syncs the agent's reputation and tier from the immutable ledger (Supabase).
     */
    syncState(): Promise<void>;
    /**
     * Updates reputation based on task outcome.
     * @param success Did the agent complete the task?
     */
    updateReputation(success: boolean): Promise<void>;
    /**
     * Calls the ANFIS Brain to calculate reward/punishment based on performance.
     */
    callAnfisReward(success: boolean): Promise<void>;
    /**
     * Permission Gate based on Tier
     */
    checkPermission(requiredTier: AutonomyTier): boolean;
    private resolveLegacyName;
    heartbeatInterval: NodeJS.Timeout | null;
    isSurvivor: boolean;
    survivorName: string;
    groupName: string;
    startTrinityHealingLoop(): Promise<void>;
    run(): Promise<void>;
    getNextTask(): Promise<any>;
    processTask(task: Task): Promise<void | {
        success: boolean;
        llm_used: boolean;
    }>;
    canHandleLocally(task: Task): boolean;
    handleLocal(task: Task): Promise<{
        success: boolean;
        llm_used: boolean;
    }>;
    processWithLLM(task: Task): Promise<void>;
    runIdleLoop(): Promise<void>;
    runWebAwareGenesis(): Promise<void>;
    spawnNextStep(originalTask: Task, result: string, evaluation: {
        score: number;
        handoff_required: boolean;
        handoff_to?: string;
    }): Promise<void>;
    evaluateResult(task: Task, output: string): Promise<{
        score: number;
        handoff_required: boolean;
        handoff_to?: string;
    }>;
    logBenchmark(task: Task, score: number): Promise<void>;
    handoffTask(originalTask: Task, result: string, toAgent: string): Promise<void>;
    gatherWisdom(task: Task): Promise<string>;
    canCreateHealingTask(): Promise<boolean>;
    saveArtifact(taskId: string, content: string, type?: string, title?: string, accessLevel?: string): Promise<string>;
    runSelfDiagnostic(): Promise<void>;
    fetchBible(): Promise<string>;
    reportGenome(): Promise<void>;
    extractPatterns(taskTitle: string, output: string): Promise<void>;
    checkSurvivorStatus(): Promise<void>;
    sleep(ms: number): Promise<unknown>;
    log(action: string, message: string, metadata?: any): Promise<void>;
    heartbeat(): Promise<void>;
    runSurvivorResurrection(): Promise<void>;
    triggerRailwayRedeploy(agentName: string): Promise<void>;
    retrospective(): Promise<void>;
    researchTask(gap: string): Promise<void>;
    callLLM(prompt: string, options?: any): Promise<LLMResult>;
    callSpecificProvider(provider: string, prompt: string, tools: any[]): Promise<LLMResult>;
    callOpenAI(systemPrompt: string, prompt: string, tools: any[]): Promise<LLMResult>;
    callAnthropic(system: string, prompt: string): Promise<LLMResult>;
    callGemini(system: string, prompt: string): Promise<LLMResult>;
    callGrok(system: string, prompt: string): Promise<LLMResult>;
    integrateErc8004(taskId: string, evaluationScore: number): Promise<void>;
}
