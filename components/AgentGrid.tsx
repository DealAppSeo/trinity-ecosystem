'use client';

import Link from 'next/link';
import { Activity, Shield, Zap, Database, Cpu, Eye, Network } from 'lucide-react';
import { SymphonyCard } from './SymphonyCard';

interface AgentGridProps {
    agents: any[]; // Flexible to handle API response
    isConductor?: boolean;
    onAssignTask?: (agentName: string) => void;
}

const GROUP_CONFIG: Record<string, any> = {
    'ORCHESTRATION': {
        color: 'text-violet-400',
        border: 'border-violet-500/30',
        bg: 'bg-violet-500/5',
        label: 'Orchestration Core',
        description: 'The central nervous system. Handles global routing, disputes, and system governance.'
    },
    'ALPHA': {
        color: 'text-blue-400',
        border: 'border-blue-500/30',
        bg: 'bg-blue-500/5',
        label: 'Alpha Squad (Security)',
        description: 'The front line of defense. Specialized in prompt firewalls, memory auditing, and ethical gating.'
    },
    'BETA': {
        color: 'text-emerald-400',
        border: 'border-emerald-500/30',
        bg: 'bg-emerald-500/5',
        label: 'Beta Squad (Design)',
        description: 'Focuses on user experience, design analysis, and empathetic system restoration.'
    },
    'GAMMA': {
        color: 'text-amber-400',
        border: 'border-amber-500/30',
        bg: 'bg-amber-500/5',
        label: 'Gamma Squad (Build)',
        description: 'The engine room. Handles code generation, infrastructure policy, and technical implementation.'
    },
};

export function AgentGrid({ agents, isConductor = false, onAssignTask }: AgentGridProps) {
    // Filter out legacy/duplicate agent names (short names)
    // Filter out legacy/duplicate agent names (short names)
    // We only want 'trinity-' prefixes now
    const BLACKLIST = ['MCP', 'MCP_SERVER', 'ANFIS_DEMO_BOT'];

    // Normalize to handle case sensitivity
    const filteredAgents = agents.filter(a => {
        const name = a.agent_name.toLowerCase();
        // Allow 'trinity-orch' etc.
        if (BLACKLIST.includes(a.agent_name)) return false;
        // Hide "short names" if they are just duplicates of full names (legacy check)
        // But for now, we just want to ensure we show the 12 specific agents
        return true;
    });

    if (filteredAgents.length === 0) {
        return (
            <div className="col-span-full text-center py-12 px-4 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/30">
                <Cpu className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-500 text-sm">No Active Agents Found</p>
                <p className="text-xs text-zinc-600 mt-1">Connecting to Symphony Network...</p>
            </div>
        );
    }

    // Group agents by their group_name
    const groupedAgents = filteredAgents.reduce((acc, agent) => {
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
                    <div key={groupName} className={`rounded-2xl border ${style.border} ${style.bg} p-6 mb-8`}>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                            <div className="flex items-center gap-3">
                                <Network className={`w-5 h-5 ${style.color}`} />
                                <h3 className={`text-sm font-bold uppercase tracking-widest ${style.color}`}>{style.label}</h3>
                            </div>
                            <p className="text-[10px] text-zinc-500 font-medium italic max-w-md">
                                {style.description || 'Specialized task force dedicated to system optimization.'}
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {groupAgents.map((agent: any) => (
                                <SymphonyCard key={agent.agent_name} agent={agent} />
                            ))}
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
