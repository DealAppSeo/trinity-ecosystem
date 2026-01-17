export type GroupId = 'ALPHA' | 'BETA' | 'GAMMA' | 'ORCHESTRATION';
export interface AgentGroup {
    id: GroupId;
    name: string;
    focus: string;
    leadAgent: string;
    members: string[];
    survivor: string | null;
    description: string;
    color?: string;
}
export declare const AGENT_GROUPS: Record<GroupId, AgentGroup>;
export declare function getGroupForAgent(agentName: string): AgentGroup | null;
export declare const ORCHESTRATION_AGENTS: string[];
export declare const SURVIVOR_AGENTS: string[];
export declare function isSurvivor(agentName: string): boolean;
export declare function isOrchestration(agentName: string): boolean;
