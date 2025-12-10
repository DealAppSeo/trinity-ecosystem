'use client';

import { AgentCard } from './AgentCard';
import { Agent } from '@/types';

interface AgentGridProps {
    agents: Agent[];
    isConductor?: boolean;
    onAssignTask?: (agentName: string) => void;
}

export function AgentGrid({ agents, isConductor = false, onAssignTask }: AgentGridProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {agents.map((agent) => (
                <AgentCard
                    key={agent.agent_name}
                    agent={agent}
                    isConductor={isConductor}
                    onAssignTask={onAssignTask}
                />
            ))}
        </div>
    );
}
