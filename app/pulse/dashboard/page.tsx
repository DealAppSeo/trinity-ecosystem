'use client';

export const dynamic = 'force-dynamic';

import { useTrinityController } from '@/hooks/useTrinityController';
import Link from 'next/link';
import { Activity, TrendingUp, Zap, Clock } from 'lucide-react';
import { cn } from '@/lib/utils'; // Assuming we have utils
import { SymphonyCard } from '@/components/SymphonyCard'; // Reusing our high-fidelity card

export default function DashboardPage() {
    const { agents, stats, tasks, logs, loading } = useTrinityController();

    // Derived stats if not provided by backend directly
    const activeAgentsCount = agents.filter(a => ['online', 'blue', 'amber'].includes(a.status)).length;
    const completedTasksCount = stats?.tasks_completed_24h || 0; // Or from tasks array
    const totalTasksCount = tasks.length + completedTasksCount;
    const systemHealth = activeAgentsCount > 0 ? Math.round((activeAgentsCount / agents.length) * 100) : 0;

    if (loading && agents.length === 0) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="w-16 h-16 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* System Health HUD */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#0B0B0F]/80 backdrop-blur-md rounded-xl p-6 border border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.15)]">
                    <div className="flex items-center justify-between mb-4">
                        <Activity className="w-8 h-8 text-violet-400" />
                        <div className={cn(
                            "w-3 h-3 rounded-full animate-pulse",
                            systemHealth > 80 ? "bg-green-400" : systemHealth > 50 ? "bg-yellow-400" : "bg-red-400"
                        )} />
                    </div>
                    <div className="text-3xl font-bold mb-1 text-white">{activeAgentsCount}</div>
                    <div className="text-sm text-gray-400">Active Agents</div>
                </div>

                <div className="bg-[#0B0B0F]/80 backdrop-blur-md rounded-xl p-6 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
                    <div className="flex items-center justify-between mb-4">
                        <TrendingUp className="w-8 h-8 text-cyan-400" />
                        <Zap className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div className="text-3xl font-bold mb-1 text-white">{completedTasksCount}</div>
                    <div className="text-sm text-gray-400">Tasks Completed</div>
                </div>

                <div className="bg-[#0B0B0F]/80 backdrop-blur-md rounded-xl p-6 border border-green-500/30">
                    <div className="flex items-center justify-between mb-4">
                        <Activity className="w-8 h-8 text-green-400" />
                    </div>
                    <div className="text-3xl font-bold mb-1 text-white">{systemHealth}%</div>
                    <div className="text-sm text-gray-400">System Health</div>
                </div>

                <div className="bg-[#0B0B0F]/80 backdrop-blur-md rounded-xl p-6 border border-yellow-500/30">
                    <div className="flex items-center justify-between mb-4">
                        <Clock className="w-8 h-8 text-yellow-400" />
                    </div>
                    <div className="text-3xl font-bold mb-1 text-white">{totalTasksCount}</div>
                    <div className="text-sm text-gray-400">Total Tasks</div>
                </div>
            </div>

            {/* 3x3 Agent Swarm Grid Preview */}
            <div className="bg-[#0B0B0F]/60 backdrop-blur-sm rounded-xl p-6 border border-white/10">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-white">Active Swarm</h2>
                    <Link
                        href="/pulse/agents"
                        className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
                    >
                        View All →
                    </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {agents.map((agent) => (
                        <SymphonyCard key={agent.agent_name} agent={agent} />
                    ))}
                </div>
            </div>

            {/* Real-time Activity Feed */}
            <div className="bg-[#0B0B0F]/60 backdrop-blur-sm rounded-xl p-6 border border-white/10">
                <h2 className="text-xl font-bold mb-6 text-white">Real-time Activity</h2>
                <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                    {logs.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                            No recent activity
                        </div>
                    ) : (
                        logs.map((log: any) => (
                            <div
                                key={log.id}
                                className="bg-white/5 rounded-lg p-4 border border-white/5 hover:border-white/10 transition-colors"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse mt-2 shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-sm text-gray-300">
                                            <span className="font-bold text-violet-300">{log.agent_name || log.agent}</span>: {log.message || log.details || log.action}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {new Date(log.created_at).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
