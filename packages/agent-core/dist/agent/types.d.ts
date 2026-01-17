export interface AgentConfig {
    name: string;
}
export type SquadRole = 'design' | 'engineering' | 'business_development' | 'governance';
export interface WisdomProfile {
    name: string;
    role: string;
    squad_role?: SquadRole;
    specialties: string[];
    tier: 'conductor' | 'specialist';
    primaryVirtue: string;
    sabbathRole?: string;
    healingPower?: string;
    isScribe?: boolean;
}
export interface ProviderConfig {
    name: string;
    baseUrl: string;
    model: string;
    envKey: string;
    tier: 'free' | 'cheap' | 'paid';
    priority: number;
    isGemini?: boolean;
    isAnthropic?: boolean;
}
export interface LLMResult {
    output: string;
    provider?: string;
    fromCache?: boolean;
    latency?: number;
}
export interface Task {
    id: string;
    title: string;
    description?: string;
    status: string;
    assigned_to?: string;
    priority: number | string;
    created_at: string;
    metadata?: string;
    github_issue_number?: number;
    requires_external_artifact?: boolean;
    transaction_hash?: string;
    task_type?: string;
    context?: string;
    belief?: number;
    disbelief?: number;
    uncertainty?: number;
}
export type TaskRecord = Task;
export type AutonomyTier = 'Assist' | 'Approve' | 'Act' | 'Learn';
export interface AgentRegistryRecord {
    agent_name: string;
    reputation_score: number;
    tasks_completed: number;
    tasks_failed: number;
    current_tier: AutonomyTier;
    last_active: string;
    status: 'active' | 'idle' | 'offline' | 'error';
    id?: string;
    system_prompt?: string;
    currentTask?: Task | null;
    lastHeartbeat?: string | null;
    soulbound_token_hash?: string;
    belief_score?: number;
}
export interface Pattern {
    task_id?: string;
    pattern_type: 'design' | 'code' | 'architecture' | 'workflow';
    trigger_keywords: string[];
    learned_insight: string;
    confidence: number;
    discovered_by: string;
}
export interface HealingDiagnosis {
    discoveredBy: string;
    discoveredAt: string;
    myBrainValid: boolean;
    siblingsHealthy: boolean;
    missingHeartbeats?: string[];
}
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
