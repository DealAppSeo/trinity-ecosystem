
'use client';

import Link from 'next/link';
import { AgentRegistryRecord } from '@/lib/agent/types';
import { Activity, Clock, Award, Layers } from 'lucide-react';
import { getGroupForAgent } from '@/lib/agent/groups';
import { cn } from '@/lib/utils';

interface SymphonyCardProps {
    agent: AgentRegistryRecord;
}

export function SymphonyCard({ agent }: SymphonyCardProps) {
    const lastHeartbeat = agent.lastHeartbeat ? new Date(agent.lastHeartbeat) : null;
    // Unified Heartbeat Logic: 2 Minutes (120000ms)
    const isOnline = lastHeartbeat && (Date.now() - lastHeartbeat.getTime() < 120000);
    const group = getGroupForAgent(agent.agent_name);

    // Derive visual role from Group
    const role = group?.focus.split(' - ')[0] || 'Autonomous Agent';

    // Calculate simple uptime string (mock logic for now, or relative time)
    let uptimeDisplay = '0h';
    if (lastHeartbeat) {
        const diffMs = Date.now() - lastHeartbeat.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 60) uptimeDisplay = `${diffMins}m`;
        else uptimeDisplay = `${Math.floor(diffMins / 60)}h`;
    }

    // Role Colors
    const roleColor = group?.id === 'ALPHA' ? 'text-blue-400'
        : group?.id === 'BETA' ? 'text-emerald-400'
            : group?.id === 'GAMMA' ? 'text-amber-400'
                : 'text-violet-400';

    const barColor = group?.id === 'ALPHA' ? 'bg-blue-500'
        : group?.id === 'BETA' ? 'bg-emerald-500'
            : group?.id === 'GAMMA' ? 'bg-amber-500'
                : 'bg-violet-500';

    return (
        <Link
            href={`/pulse/conductor?agent=${agent.agent_name}`}
            className="group relative flex flex-col justify-between h-[160px] bg-[#0B0B0F] border border-white/5 rounded-2xl p-6 hover:border-white/10 hover:shadow-2xl hover:bg-[#121218] transition-all duration-300 overflow-hidden"
        >
            <div className="flex justify-between items-start z-10 w-full">
                {/* Left: Identity */}
                <div className="flex flex-col flex-1 min-w-0 pr-4">
                    <h3 className="text-xl font-bold text-white tracking-tight group-hover:text-white/90 transition-colors truncate">
                        {agent.agent_name}
                    </h3>
                    <p className="text-xs font-semibold text-zinc-500 mt-1 mb-2">
                        {role}
                    </p>

                    {/* Current Activity Display */}
                    {agent.currentTask ? (
                        <div className="flex items-center gap-2 mt-auto animate-in fade-in slide-in-from-left-2 duration-500">
                            <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                            <p className="text-[10px] text-zinc-400 font-mono truncate max-w-[140px]" title={agent.currentTask.title}>
                                {agent.currentTask.title}
                            </p>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 mt-auto opacity-50">
                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                            <p className="text-[10px] text-zinc-600 font-mono">Idle</p>
                        </div>
                    )}
                </div>

                {/* Right: Metrics Stack (Right Aligned) */}
                <div className="flex flex-col items-end space-y-1">
                    <div className={cn(
                        "w-2.5 h-2.5 rounded-full mb-3 shadow-[0_0_8px_currentColor] transition-all duration-500",
                        isOnline ? "bg-green-500 text-green-500" : "bg-zinc-800 text-zinc-800"
                    )} />

                    <div className="flex items-center gap-3 text-right">
                        <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider">Rep</span>
                        <span className={cn("text-lg font-bold leading-none", roleColor)}>{agent.reputation_score || 0}</span>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                        <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider">Tasks</span>
                        <span className="text-sm font-bold text-zinc-400 leading-none">{agent.tasks_completed || 0}</span>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                        <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider">Uptime</span>
                        <span className="text-sm font-bold text-zinc-400 leading-none">{uptimeDisplay}</span>
                    </div>
                </div>
            </div>

            {/* Bottom Progress Bar (Slim, Figma Style) */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-900/50">
                <div
                    className={cn("h-full transition-all duration-1000 ease-out shadow-[0_0_10px_currentColor]", barColor)}
                    style={{ width: `${Math.min((agent.reputation_score || 0), 100)}%` }}
                />
            </div>

            {/* Subtle Gradient Glow */}
            <div className={cn(
                "absolute -right-4 -bottom-4 w-24 h-24 rounded-full blur-[50px] opacity-0 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none",
                barColor
            )} />
        </Link>
    );
}
