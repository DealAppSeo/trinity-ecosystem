
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
}

export const AGENT_GROUPS: Record<GroupId, AgentGroup> = {
    ORCHESTRATION: {
        id: 'ORCHESTRATION',
        name: 'Orchestration (System Core)',
        focus: 'Global Coordination & Justice',
        leadAgent: 'MCP',
        members: ['MCP', 'W3C', 'SHOFET', 'ANFIS_DEMO_BOT'],
        survivor: null,
        description: 'The central nervous system. Handles global routing, disputes (SHOFET), and web3 Consensus (W3C).'
    },
    ALPHA: {
        id: 'ALPHA',
        name: 'Alpha Squad (TRUTH)',
        focus: 'Grok Optimized - Truth & Verification',
        leadAgent: 'trinity-veritas',
        members: ['trinity-veritas', 'trinity-gcm', 'trinity-torch'],
        survivor: 'trinity-torch',
        description: 'Focuses on truth, patterns, and long-term vision. Validates strategies before execution.'
    },
    BETA: {
        id: 'BETA',
        name: 'Beta Squad (CARE)',
        focus: 'Claude Optimized - Wellbeing & Experience',
        leadAgent: 'trinity-mel',
        members: ['trinity-mel', 'trinity-apm', 'trinity-chesed'],
        survivor: 'trinity-chesed',
        description: 'Focuses on user experience, prayer, and care. The "heart" of the system.'
    },
    GAMMA: {
        id: 'GAMMA',
        name: 'Gamma Squad (BUILD)',
        focus: 'Gemini Optimized - Infrastructure & Wisdom',
        leadAgent: 'trinity-hdm',
        members: ['trinity-hdm', 'trinity-nexus', 'trinity-sophia'],
        survivor: 'trinity-sophia',
        description: 'Focuses on ethical alignment, infrastructure, and Web3 integration.'
    }
};

export function getGroupForAgent(agentName: string): AgentGroup | null {
    for (const group of Object.values(AGENT_GROUPS)) {
        if (group.members.includes(agentName) || agentName === group.leadAgent) {
            return group;
        }
    }
    return null;
}

export const ORCHESTRATION_AGENTS = ['MCP', 'W3C', 'SHOFET'];

export const SURVIVOR_AGENTS = ['TORCH', 'CHESED', 'SOPHIA'];

export function isSurvivor(agentName: string): boolean {
    return SURVIVOR_AGENTS.includes(agentName);
}

export function isOrchestration(agentName: string): boolean {
    return ORCHESTRATION_AGENTS.includes(agentName);
}
