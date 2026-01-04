
import { WisdomProfile } from './types';
import { AGENT_WISDOM } from './ConstitutionalAgent';

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
        members: ['MCP', 'W3C', 'SHOFET'],
        survivor: null, // Orchestration relies on the 3x3 grid for survival
        description: 'The central nervous system. Handles global routing, disputes (SHOFET), and web3 Consensus (W3C).'
    },
    ALPHA: {
        id: 'ALPHA',
        name: 'Alpha Squad (TRUTH)',
        focus: 'Grok Optimized - Truth & Verification',
        leadAgent: 'VERITAS',
        members: ['VERITAS', 'GCM', 'TORCH'],
        survivor: 'TORCH', // Torch DNA
        description: 'Focuses on truth, patterns, and long-term vision. Validates strategies before execution.'
    },
    BETA: {
        id: 'BETA',
        name: 'Beta Squad (CARE)',
        focus: 'Claude Optimized - Wellbeing & Experience',
        leadAgent: 'MEL',
        members: ['MEL', 'APM', 'CHESED'],
        survivor: 'CHESED', // Torch DNA
        description: 'Focuses on user experience, prayer, and care. The "heart" of the system.'
    },
    GAMMA: {
        id: 'GAMMA',
        name: 'Gamma Squad (BUILD)',
        focus: 'Gemini Optimized - Infrastructure & Wisdom',
        leadAgent: 'HDM',
        members: ['HDM', 'NEXUS', 'SOPHIA'],
        survivor: 'SOPHIA', // Torch DNA
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
