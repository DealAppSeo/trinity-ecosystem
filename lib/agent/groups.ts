
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
        name: 'Alpha Squad (SECURITY)',
        focus: 'GuardRail Core - Firewall & Auditor',
        leadAgent: 'trinity-veritas',
        members: ['trinity-torch', 'trinity-veritas', 'trinity-gcm'],
        survivor: 'trinity-torch',
        description: 'The front line of defense. Handles prompt injections, memory auditing, and ethical gating.'
    },
    BETA: {
        id: 'BETA',
        name: 'Beta Squad (DESIGN)',
        focus: 'Visual Trust - Design & Experience',
        leadAgent: 'trinity-mel',
        members: ['trinity-chesed', 'trinity-mel', 'trinity-apm'],
        survivor: 'trinity-chesed',
        description: 'Focuses on user experience, design analysis, and empathetic restoration.'
    },
    GAMMA: {
        id: 'GAMMA',
        name: 'Gamma Squad (BUILD)',
        focus: 'Infrastructure & Coding',
        leadAgent: 'trinity-hdm',
        members: ['trinity-sophia', 'trinity-nexus', 'trinity-hdm'],
        survivor: 'trinity-sophia',
        description: 'Handles the code generation, network policy enforcement, and technical wisdom.'
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
    // New ORCH alias check (Exact match for orch to avoid torch collision)
    if (target.includes('mcp') || target === 'trinity-orch' || target === 'orch' || target.includes('w3c') || target.includes('shofet')) return AGENT_GROUPS.ORCHESTRATION;

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

