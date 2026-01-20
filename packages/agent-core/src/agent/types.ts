export interface AgentConfig {
    name: string;
    projectId?: string;
    provider?: string;
}

export type SquadRole = 'design' | 'engineering' | 'business_development' | 'governance';
export type MCPPhase = 'WAKE' | 'FIND_TASK' | 'EXECUTE' | 'COMPLETE' | 'IDLE' | 'EVERGREEN' | 'HEALING' | 'ITERATE';

export interface WisdomProfile {
    name: string;
    role: string;
    specialties: string[];
    tier: 'conductor' | 'specialist';
    primaryVirtue: string;
    squad?: 'ALPHA' | 'BETA' | 'GAMMA' | 'ORCHESTRATION' | 'UNKNOWN'; // ALPHA (TRUTH), BETA (CARE), GAMMA (BUILD)
    squad_role?: SquadRole; // The Trinity Triad Role
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
    transaction_hash?: string; // Proto-DAG audit trail
    task_type?: string;
    context?: string;
    // v8.0 AUDIT COLUMNS
    claimed_by?: string;
    verify_count?: number;
    verified_by?: string[];
    result?: string;
    artifact_url?: string;
    // SUBJECTIVE LOGIC: b+d+u=1
    belief?: number;
    disbelief?: number;
    uncertainty?: number;
    requires_consensus?: boolean;
    consensus_group?: string;
    signatures?: any[];
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
    status: 'active' | 'idle' | 'offline' | 'error' | 'online' | 'green' | 'blue' | 'amber' | 'working' | 'stale';
    id?: string; // Optional ID for grid keys
    system_prompt?: string; // Dynamic Directive from Control Plane
    currentTask?: Task | null;
    lastHeartbeat?: string | null;
    // GOVERNANCE ENRICHMENT
    soulbound_token_hash?: string;
    belief_score?: number;
}

// ============================================
// BRAIN TRANSPLANT: SHARED ORGANS
// ============================================

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
