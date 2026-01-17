export type AgentStatus = 'online' | 'offline' | 'working' | 'error' | 'stale' | 'green' | 'blue' | 'amber' | 'active';

export interface Agent {
    agent_name: string;
    status: AgentStatus;
    current_task: string | null;
    last_heartbeat?: string;
    repid_score: number;
    platform: string;
    role: string;
    capabilities?: string[]; // Optional if not in DB, but useful for frontend
}

export interface TrinityTask {
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed' | 'done' | 'verified' | 'failed' | 'pending_clarification';
    assigned_agent: string | null;
    priority: number;
    created_at: string;
}

export interface CostTracking {
    date: string;
    traditional_cost: number;
    trinity_cost: number;
}

export interface EcosystemApp {
    slug: string;
    name: string;
    tagline: string;
    url: string;
    status: 'live' | 'beta' | 'concept';
    icon_emoji: string;
}

export interface Lead {
    email: string;
    name: string;
    role: string;
    company: string;
    referral_source: string;
    referral_detail?: string;
    wants_ecosystem_consideration: boolean;
}

export interface DemoViewer {
    session_id: string;
    viewer_name: string;
    is_active: boolean;
    joined_at: string;
    engagement_score: number;
}
