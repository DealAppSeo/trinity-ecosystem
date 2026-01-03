'use client';

import { Shield, CheckCircle, Cpu } from 'lucide-react';
import { AgentRegistryRecord } from '@/lib/agent/types';

interface AgentGridProps {
    agents: AgentRegistryRecord[];
    isConductor?: boolean;
    onAssignTask?: (agentName: string) => void;
}

export function AgentGrid({ agents, isConductor = false, onAssignTask }: AgentGridProps) {
    if (agents.length === 0) {
        return (
            <div className="col-span-full text-center py-12 px-4 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/30">
                <Cpu className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-500 text-sm">No Active Agents Found</p>
                <p className="text-xs text-zinc-600 mt-1">Run initialization script to register agents.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {agents.map((agent) => (
                <div key={agent.id} className="bg-gray-900 border border-gray-800 p-4 rounded-lg hover:border-blue-500 transition-colors group relative">
                    {/* Status Dot */}
                    <div className={`absolute top-3 right-3 w-2 h-2 rounded-full ${agent.status === 'active' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' :
                            agent.status === 'idle' ? 'bg-blue-500' : 'bg-gray-600'
                        }`} />

                    <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-lg text-gray-100">{agent.agent_name}</h3>
                    </div>

                    {/* Tier Badge */}
                    <span className={`inline-block mb-3 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${agent.current_tier === 'Act' ? 'bg-green-900/60 text-green-300 border border-green-800' :
                            agent.current_tier === 'Approve' ? 'bg-yellow-900/60 text-yellow-300 border border-yellow-800' :
                                'bg-blue-900/60 text-blue-300 border border-blue-800'
                        }`}>
                        {agent.current_tier}
                    </span>

                    <div className="flex items-center gap-4 text-xs text-gray-400">
                        <div className="flex items-center gap-1.5" title="Reputation Score">
                            <Shield className="w-3.5 h-3.5 text-blue-400" />
                            <span className="font-mono">{agent.reputation_score}</span>
                        </div>
                        <div className="flex items-center gap-1.5" title="Tasks Completed">
                            <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                            <span className="font-mono">{agent.tasks_completed}</span>
                        </div>
                    </div>

                    {isConductor && (
                        <button
                            onClick={() => onAssignTask && onAssignTask(agent.agent_name)}
                            className="mt-3 w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 rounded border border-zinc-700 transition-colors opacity-0 group-hover:opacity-100"
                        >
                            Assign Task
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}
