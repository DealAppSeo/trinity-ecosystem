
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
    const isOnline = agent.status === 'active';
    const group = getGroupForAgent(agent.agent_name);

    // Derive visual role from Group
    const role = group?.focus.split(' - ')[0] || 'Autonomous Agent';

    // Calculate simple uptime string (mock logic for now, or relative time)
    const lastHeartbeat = agent.lastHeartbeat ? new Date(agent.lastHeartbeat) : null;
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
            className="group relative flex flex-col justify-between h-[180px] bg-[#0F0F13] border border-white/5 rounded-2xl p-5 hover:border-white/10 hover:shadow-2xl hover:bg-[#141419] transition-all duration-300 overflow-hidden"
        >
            {/* Top Row: Name & Status */}
            <div className="flex justify-between items-start z-10">
                <div>
                    <h3 className="text-lg font-bold text-white tracking-tight group-hover:text-white/90 transition-colors">
                        {agent.agent_name}
                    </h3>
                    <p className={cn("text-xs font-medium uppercase tracking-wider mt-0.5", roleColor)}>
                        {role}
                    </p>
                </div>
                <div className={cn(
                    "w-2.5 h-2.5 rounded-full shadow-[0_0_8px_currentColor] transition-all duration-500",
                    isOnline ? "bg-green-500 text-green-500 animate-pulse" : "bg-zinc-700 text-zinc-700"
                )} />
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 gap-1 my-4 z-10">
                <div className="flex justify-between items-center">
                    <span className="text-zinc-500 text-xs font-medium flex items-center gap-1.5">
                        <Award className="w-3 h-3" /> Reputation
                    </span>
                    <span className="text-sm font-bold text-zinc-200">{agent.reputation_score || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-zinc-500 text-xs font-medium flex items-center gap-1.5">
                        <Layers className="w-3 h-3" /> Tasks
                    </span>
                    <span className="text-sm font-bold text-zinc-200">{agent.tasks_completed || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-zinc-500 text-xs font-medium flex items-center gap-1.5">
                        <Clock className="w-3 h-3" /> Uptime
                    </span>
                    <span className="text-sm font-bold text-zinc-200">{isOnline ? 'Active' : 'Offline'}</span>
                </div>
            </div>

            {/* Bottom Progress Bar */}
            <div className="relative h-1.5 w-full bg-zinc-800/50 rounded-full overflow-hidden mt-auto">
                <div
                    className={cn("absolute left-0 top-0 bottom-0 transition-all duration-1000 ease-out", barColor)}
                    style={{ width: `${Math.min((agent.reputation_score || 0), 100)}%` }}
                />
            </div>

            {/* Background Glow (Figma Style) */}
            <div className={cn(
                "absolute -right-10 -bottom-10 w-32 h-32 rounded-full blur-[60px] opacity-0 group-hover:opacity-20 transition-opacity duration-500 pointer-events-none",
                barColor.replace('bg-', 'bg-') // Reuse color
            )} />
        </Link>
    );
}
