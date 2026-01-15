
import { WisdomProfile } from './types';
import { AGENT_WISDOM } from './wisdom';

export type GroupId = 'ALPHA' | 'BETA' | 'GAMMA' | 'ORCHESTRATION';

export interface AgentGroup {
    id: GroupId;
    name: string;
    focus: string;
    leadAgent: string;
    members: string[];
    survivor: string | null; // The designated survivor/DNA agent for this group
    description: string;
    color?: string; // Added color property
}


export const AGENT_GROUPS: Record<GroupId, AgentGroup> = {
    ORCHESTRATION: {
        id: 'ORCHESTRATION',
        name: 'Orchestration (System Core)',
        leadAgent: 'trinity-orch',
        members: ['trinity-orch', 'trinity-w3c', 'trinity-shofet'],
        focus: 'Orchestration - System Governance & Protocol Enforcement',
        color: 'bg-violet-500',
        survivor: null,
        description: 'The central nervous system. Handles global routing, disputes (SHOFET), and web3 Consensus (W3C).'
    },
    ALPHA: {
        id: 'ALPHA',
        name: 'Alpha Squad (TRUTH)',
        focus: 'Grok Optimized - Truth & Verification',
        leadAgent: 'trinity-veritas',
        members: ['trinity-torch', 'trinity-veritas', 'trinity-gcm'],
        survivor: 'trinity-torch',
        description: 'Focuses on truth, patterns, and long-term vision. Validates strategies before execution.'
    },
    BETA: {
        id: 'BETA',
        name: 'Beta Squad (CARE)',
        focus: 'Claude Optimized - Wellbeing & Experience',
        leadAgent: 'trinity-mel',
        members: ['trinity-chesed', 'trinity-mel', 'trinity-apm'],
        survivor: 'trinity-chesed', // User said "Chesed, Mel, and APM" - Chesed is usually heart
        description: 'Focuses on user experience, prayer, and care. The "heart" of the system.'
    },
    GAMMA: {
        id: 'GAMMA',
        name: 'Gamma Squad (BUILD)',
        focus: 'Gemini Optimized - Infrastructure & Wisdom',
        leadAgent: 'trinity-hdm',
        members: ['trinity-sophia', 'trinity-nexus', 'trinity-hdm'],
        survivor: 'trinity-sophia',
        description: 'Focuses on ethical alignment, infrastructure, and Web3 integration.'
    }
};

export function getGroupForAgent(agentName: string): AgentGroup | null {
    const normalize = (n: string) => n.toLowerCase();
    const target = normalize(agentName);

    for (const group of Object.values(AGENT_GROUPS)) {
        if (group.members.map(normalize).includes(target) || normalize(group.leadAgent) === target) {
            return group;
        }
    }
    // New ORCH alias check
    if (target.includes('mcp') || target.includes('orch') || target.includes('w3c') || target.includes('shofet')) return AGENT_GROUPS.ORCHESTRATION;

    return null;
}

export const ORCHESTRATION_AGENTS = ['trinity-orch', 'trinity-w3c', 'trinity-shofet'];
export const SURVIVOR_AGENTS = ['trinity-torch', 'trinity-chesed', 'trinity-sophia'];

export function isSurvivor(agentName: string): boolean {
    return SURVIVOR_AGENTS.includes(agentName.toLowerCase());
}

export function isOrchestration(agentName: string): boolean {
    return ORCHESTRATION_AGENTS.includes(agentName.toLowerCase());
}

