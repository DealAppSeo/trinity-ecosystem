
import { WisdomProfile } from './types';
import { AGENT_WISDOM } from './ConstitutionalAgent';

export type GroupId = 'ALPHA' | 'BETA' | 'GAMMA';

export interface AgentGroup {
    id: GroupId;
    name: string;
    focus: string;
    leadAgent: string;
    members: string[];
    description: string;
}

export const AGENT_GROUPS: Record<GroupId, AgentGroup> = {
    ALPHA: {
        id: 'ALPHA',
        name: 'Alpha Squad (Strategy)',
        focus: 'high_level_strategy',
        leadAgent: 'VERITAS',
        members: ['VERITAS', 'HDM', 'TORCH_ALPHA'],
        description: 'Focuses on truth, patterns, and long-term vision. Validates strategies before execution.'
    },
    BETA: {
        id: 'BETA',
        name: 'Beta Squad (Execution)',
        focus: 'implementation_delivery',
        leadAgent: 'MEL',
        members: ['MEL', 'APM', 'GCM'],
        description: 'Focuses on building, user experience, and governance. The "hands" of the system.'
    },
    GAMMA: {
        id: 'GAMMA',
        name: 'Gamma Squad (Ethics & Web3)',
        focus: 'compliance_decentralization',
        leadAgent: 'NEXUS', // Placeholder for now, or use W3C
        members: ['W3C', 'TORCH_GAMMA', 'NEXUS'],
        description: 'Focuses on ethical alignment, Web3 integration, and blockchain consensus.'
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
