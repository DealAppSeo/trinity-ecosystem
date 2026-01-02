export interface AgentConfig {
    name: string;
}

export interface WisdomProfile {
    name: string;
    role: string;
    specialties: string[];
    tier: 'conductor' | 'specialist';
    primaryVirtue: string;
    sabbathRole: string;
    healingPower: string;
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
    priority: number;
    created_at: string;
    metadata?: string;
    github_issue_number?: number;
    requires_external_artifact?: boolean;
    transaction_hash?: string; // Proto-DAG audit trail
}

export type AutonomyTier = 'Assist' | 'Approve' | 'Act' | 'Learn';

export interface AgentRegistryRecord {
    agent_name: string;
    reputation_score: number;
    tasks_completed: number;
    tasks_failed: number;
    current_tier: AutonomyTier;
    last_active: string;
}
