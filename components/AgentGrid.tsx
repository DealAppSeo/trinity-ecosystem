'use client';

import { Activity, Shield, Zap, Database, Cpu, Eye, Network } from 'lucide-react';

interface AgentGridProps {
    agents: any[]; // Flexible to handle API response
    isConductor?: boolean;
    onAssignTask?: (agentName: string) => void;
}

const GROUP_CONFIG: Record<string, any> = {
    'ORCHESTRATION': { color: 'text-violet-400', border: 'border-violet-500/30', bg: 'bg-violet-500/5', label: 'Orchestration Core' },
    'ALPHA': { color: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500/5', label: 'Alpha Squad (Truth)' },
    'BETA': { color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', label: 'Beta Squad (Care)' },
    'GAMMA': { color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/5', label: 'Gamma Squad (Build)' },
};

export function AgentGrid({ agents, isConductor = false, onAssignTask }: AgentGridProps) {
    if (agents.length === 0) {
        return (
            <div className="col-span-full text-center py-12 px-4 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/30">
                <Cpu className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-500 text-sm">No Active Agents Found</p>
                <p className="text-xs text-zinc-600 mt-1">Connecting to Symphony Network...</p>
            </div>
        );
    }

    // Group agents by their group_name
    const groupedAgents = agents.reduce((acc, agent) => {
        const group = agent.group_name || 'UNKNOWN';
        if (!acc[group]) acc[group] = [];
        acc[group].push(agent);
        return acc;
    }, {} as Record<string, any[]>);

    // Order: Orchestration -> Alpha -> Beta -> Gamma
    const groupOrder = ['ORCHESTRATION', 'ALPHA', 'BETA', 'GAMMA'];

    return (
        <div className="space-y-6">
            {groupOrder.map(groupName => {
                const groupAgents = groupedAgents[groupName] || [];
                if (groupAgents.length === 0) return null;

                const style = GROUP_CONFIG[groupName] || { color: 'text-zinc-400', border: 'border-zinc-800', bg: 'bg-zinc-900', label: groupName };

                return (
                    <div key={groupName} className={`rounded-xl border ${style.border} ${style.bg} p-4`}>
                        <div className="flex items-center gap-2 mb-3">
                            <Network className={`w-4 h-4 ${style.color}`} />
                            <h3 className={`text-sm font-bold uppercase tracking-wider ${style.color}`}>{style.label}</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {groupAgents.map((agent: any) => {
                                const isOnline = agent.status === 'active';
                                const isSurvivor = agent.is_survivor;

                                return (
                                    <div key={agent.agent_name} className="bg-black/40 border border-white/5 rounded-lg p-3 hover:border-white/10 transition-colors group relative">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500/50'}`} />
                                                <span className="font-mono font-bold text-zinc-200">{agent.agent_name}</span>
                                            </div>
                                            {isSurvivor && (
                                                <span className="text-[10px] bg-red-900/40 text-red-200 px-1.5 py-0.5 rounded border border-red-800/50 flex items-center gap-1">
                                                    🔥 SURVIVOR
                                                </span>
                                            )}
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex justify-between text-xs">
                                                <span className="text-zinc-500">Coord:</span>
                                                <span className="text-zinc-300">{agent.llm_coordinator}</span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="text-zinc-500">Ping:</span>
                                                <span className="text-zinc-400 font-mono">
                                                    {agent.last_ping ? new Date(agent.last_ping).toLocaleTimeString() : 'Never'}
                                                </span>
                                            </div>
                                        </div>

                                        {isConductor && (
                                            <button
                                                onClick={() => onAssignTask && onAssignTask(agent.agent_name)}
                                                className="mt-3 w-full py-1 text-[10px] font-medium bg-white/5 hover:bg-white/10 border border-white/5 rounded text-zinc-400 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                Assign Task
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {/* Catch-all for unknown groups if any */}
            {groupedAgents['UNKNOWN'] && (
                <div className="rounded-xl border border-dashed border-zinc-700 p-4">
                    <h3 className="text-sm font-bold text-zinc-500 mb-3">Unassigned Agents</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {groupedAgents['UNKNOWN'].map((agent: any) => (
                            <div key={agent.agent_name} className="bg-zinc-900 border border-zinc-800 p-3 rounded">{agent.agent_name}</div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
