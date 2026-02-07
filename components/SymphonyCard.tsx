'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AgentRegistryRecord } from '@/lib/agent/types';
import { Activity, Clock, Award, Layers } from 'lucide-react';
import { RepIdBadge } from '@/components/ui/RepIdBadge';
import { getGroupForAgent } from '@/lib/agent/groups';
import { cn } from '@/lib/utils';
import { AgentDetailModal } from './modals/AgentDetailModal';

interface SymphonyCardProps {
    agent: AgentRegistryRecord;
}

export function SymphonyCard({ agent }: SymphonyCardProps) {
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    // Unified Heartbeat Logic (v3.4 - SSOT Consolidation)
    const lastHeartbeat = agent.last_active ? new Date(agent.last_active) : null;
    const isRecentlyActive = lastHeartbeat && (Date.now() - lastHeartbeat.getTime() < 5 * 60 * 1000);
    const isOnline = isRecentlyActive && ['online', 'active', 'green', 'blue', 'amber', 'working', 'idle'].includes(agent.status);
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
        <>
            <div
                onClick={() => setIsDetailOpen(true)}
                className="group relative bg-[#0B0B0F]/80 backdrop-blur-xl rounded-2xl p-5 border border-white/10 hover:border-violet-500/50 hover:shadow-[0_0_30px_rgba(139,92,246,0.15)] transition-all duration-500 overflow-hidden cursor-pointer"
            >
                <div className="flex justify-between items-start z-10 w-full">
                    {/* Left: Identity */}
                    <div className="flex flex-col flex-1 min-w-[80px] pr-2">
                        <h3 className="text-lg font-bold text-white tracking-tight group-hover:text-white/90 transition-colors line-clamp-1 break-all" title={agent.agent_name}>
                            {agent.agent_name.replace('trinity-', '').toUpperCase()}
                        </h3>
                        <p className="text-[10px] font-semibold text-zinc-500 mt-1 mb-2 truncate">
                            {role}
                        </p>

                        {/* Current Activity Display */}
                        <div className="mt-auto">
                            <span className="text-[8px] text-zinc-600 font-bold uppercase tracking-wider mb-1 block">Current Work</span>
                            {(agent as any).current_task_summary || agent.currentTask ? (
                                <div className="flex items-center gap-2 mt-auto animate-in fade-in slide-in-from-left-2 duration-500">
                                    <div className={cn(
                                        "w-1.5 h-1.5 rounded-full animate-pulse",
                                        ((agent as any).current_task_summary || agent.currentTask?.title)?.toLowerCase().includes('clarification')
                                            ? "bg-amber-500 shadow-[0_0_8px_#fbbf24]"
                                            : (((agent as any).current_task_summary || agent.currentTask?.title)?.toLowerCase().includes('verifying') ||
                                                ((agent as any).current_task_summary || agent.currentTask?.title)?.toLowerCase().includes('reviewing'))
                                                ? "bg-cyan-500 shadow-[0_0_8px_#06b6d4]"
                                                : "bg-green-500 shadow-[0_0_8px_#22c55e]"
                                    )} />
                                    <p className={cn(
                                        "text-[10px] font-mono line-clamp-2 leading-tight",
                                        ((agent as any).current_task_summary || agent.currentTask?.title)?.toLowerCase().includes('clarification')
                                            ? "text-amber-400"
                                            : (((agent as any).current_task_summary || agent.currentTask?.title)?.toLowerCase().includes('verifying') ||
                                                ((agent as any).current_task_summary || agent.currentTask?.title)?.toLowerCase().includes('reviewing'))
                                                ? "text-cyan-400"
                                                : "text-green-400"
                                    )} title={(agent as any).current_task_summary || agent.currentTask?.title}>
                                        {(agent as any).current_task_summary || agent.currentTask?.title}
                                    </p>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 mt-auto opacity-50">
                                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                                    <p className="text-[10px] text-zinc-600 font-mono">Idle</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Metrics Stack (Right Aligned) */}
                    <div className="flex flex-col items-end space-y-1">
                        <div className={cn(
                            "w-2.5 h-2.5 rounded-full mb-3 shadow-[0_0_8px_currentColor] transition-all duration-500",
                            agent.status === 'amber' ? "bg-amber-500 text-amber-500" :
                                agent.status === 'blue' ? "bg-blue-500 text-blue-500" :
                                    (isOnline || agent.status === 'online' || agent.status === 'active' || agent.status === 'green') ? "bg-green-500 text-green-500" :
                                        "bg-zinc-800 text-zinc-800"
                        )} />

                        <div className="flex items-center gap-3 text-right">
                            <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider">Rep</span>
                            <span className={cn("text-lg font-bold leading-none", roleColor)}>
                                {typeof agent.reputation_score === 'number' ? agent.reputation_score.toFixed(1) : agent.reputation_score || 0}
                            </span>
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
            </div>

            <AgentDetailModal
                agent={agent}
                isOpen={isDetailOpen}
                onClose={() => setIsDetailOpen(false)}
            />
        </>
    );
}
