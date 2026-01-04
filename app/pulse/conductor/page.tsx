'use client';

import { Header } from '@/components/Header';
import { AgentGrid } from '@/components/AgentGrid';
import { CostTicker } from '@/components/CostTicker';
import { Button } from '@/components/ui/Button';
import { TaskQueue } from '@/components/TaskQueue';
import { ActivityFeed } from '@/components/ActivityFeed';
import { useEffect, useState, useCallback } from 'react';
import { AddTaskModal } from '@/components/modals/AddTaskModal';
import { Skeleton } from '@/components/ui/Skeleton';
import InviteManager from '@/components/InviteManager';
import { Skull, Share2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase'; // Used for InviteManager

export default function ConductorPage() {
    const [agents, setAgents] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [stats, setStats] = useState({ online_agents: 0, tasks_completed_24h: 0, active_tasks: 0 });
    const [loading, setLoading] = useState(true);
    const [showAddTask, setShowAddTask] = useState(false);

    // Polling Fetcher
    const refreshData = useCallback(async () => {
        try {
            const [agentsRes, tasksRes, statsRes] = await Promise.all([
                fetch('/api/agents'),
                fetch('/api/tasks'),
                fetch('/api/stats')
            ]);

            if (agentsRes.ok) setAgents(await agentsRes.json());
            if (tasksRes.ok) setTasks(await tasksRes.json());
            if (statsRes.ok) setStats(await statsRes.json());

        } catch (error) {
            console.error('Polling Error:', error);
        }
    }, []);

    // Initial Fetch + Interval
    useEffect(() => {
        const init = async () => {
            setLoading(true);
            await refreshData();
            setLoading(false);
        };
        init();

        const interval = setInterval(refreshData, 10000); // 10s poll
        return () => clearInterval(interval);
    }, [refreshData]);

    const handleAssignTask = async (taskId: string, agentName: string) => {
        try {
            await fetch(`/api/tasks/${taskId}/assign`, {
                method: 'POST',
                body: JSON.stringify({ agent: agentName })
            });
            refreshData(); // immediate refresh
        } catch (e) {
            alert('Assignment failed');
        }
    };

    return (
        <div className="min-h-screen bg-obsidian-base flex flex-col">
            <Header
                title="CONDUCTOR CONSOLE"
                showLive
                viewerCount={stats.online_agents} // Real active agents count
                rightContent={
                    <div className="flex gap-2 text-xs text-white/30 font-mono items-center">
                        CONNECTED: CONTROLLER.AITRINITYSYMPHONY.COM
                    </div>
                }
            />

            <main className="flex-1 container mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-140px)]">

                {/* LEFT COLUMN: Grid & Activity */}
                <div className="lg:col-span-3 flex flex-col gap-6 h-full overflow-hidden">

                    {/* Chaos & Squad Panel */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
                        {/* Chaos Testing */}
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 relative overflow-hidden group">
                            <div className="absolute inset-0 bg-red-900/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="flex items-start justify-between relative z-10">
                                <div className="flex items-center gap-2">
                                    <Skull className="w-5 h-5 text-red-500" />
                                    <div>
                                        <h2 className="text-sm font-bold text-zinc-100">Chaos Testing</h2>
                                        <p className="text-zinc-500 text-[10px]">Anti-fragility simulation</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => alert('Feature disabled in PROD')} className="px-3 py-1 bg-red-950/50 border border-red-900/30 text-red-300 text-xs rounded hover:bg-red-900/80 transition-colors">
                                        Kill Random
                                    </button>
                                    <button onClick={() => alert('Feature disabled in PROD')} className="px-3 py-1 bg-orange-950/50 border border-orange-900/30 text-orange-300 text-xs rounded hover:bg-orange-900/80 transition-colors">
                                        Sever DB
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Squad Status Summary */}
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Share2 className="w-4 h-4 text-blue-500" />
                                <h2 className="text-sm font-bold text-zinc-100">Squad Status</h2>
                            </div>
                            <div className="flex gap-2">
                                {['Alpha', 'Beta', 'Gamma'].map(group => {
                                    // Calculate online count for this group
                                    const groupAgents = agents.filter(a => (a.group_name || '').toLowerCase().includes(group.toLowerCase()));
                                    const onlineCount = groupAgents.filter(a => a.status === 'active').length;
                                    const total = groupAgents.length || 3; // default to 3 if loading

                                    return (
                                        <div key={group} className="flex-1 bg-black/40 py-1.5 px-2 rounded border border-zinc-800/50 text-center">
                                            <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-0.5">{group}</div>
                                            <div className={`text-[10px] font-mono font-bold ${onlineCount === total ? 'text-green-400' : 'text-yellow-400'}`}>
                                                {onlineCount}/{total} ONLINE
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Agents Grid */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-xl font-semibold text-text-primary">Symphony Grid</h2>
                            <div className="flex gap-2">
                                {loading ? (
                                    <Skeleton className="w-24 h-6" />
                                ) : (
                                    <span className="text-xs text-status-online bg-status-online/10 px-2 py-1 rounded border border-status-online/20 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                        {stats.online_agents}/12 Systems Active
                                    </span>
                                )}
                            </div>
                        </div>

                        {loading && agents.length === 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
                            </div>
                        ) : (
                            <AgentGrid
                                agents={agents}
                                isConductor={true}
                                onAssignTask={(agentName) => {
                                    /* Handle assignment in next iteration if UI supported */
                                    console.log('Assign to', agentName);
                                }}
                            />
                        )}
                    </div>

                    {/* Activity Feed (Bottom) */}
                    <div className="h-48 shrink-0">
                        <ActivityFeed />
                    </div>
                </div>

                {/* RIGHT COLUMN: Tasks & Stats */}
                <div className="lg:col-span-1 flex flex-col gap-6 h-full">

                    {/* Invite Manager */}
                    <div className="shrink-0">
                        <InviteManager supabase={supabase} />
                    </div>

                    {/* Task Queue */}
                    <div className="flex-1 flex flex-col min-h-0">
                        <TaskQueue
                            tasks={tasks}
                            onAddTask={() => setShowAddTask(true)}
                        />
                    </div>

                    {/* Real Stats */}
                    <div className="p-4 bg-obsidian-surface border border-obsidian-border rounded-lg shrink-0">
                        <h3 className="text-sm font-bold text-text-primary mb-3">Network Stats</h3>
                        <div className="space-y-2 text-sm text-text-secondary">
                            <div className="flex justify-between">
                                <span>Active Agents</span>
                                <span className="text-status-online font-mono">{stats.online_agents}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Tasks (24h)</span>
                                <span className="text-blue-400 font-mono">{stats.tasks_completed_24h}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Queue Load</span>
                                <span className="text-accent-violet font-mono">{stats.active_tasks}</span>
                            </div>
                        </div>
                    </div>
                </div>

            </main>

            <CostTicker traditional={847.00} trinity={0.47} />

            <AddTaskModal
                isOpen={showAddTask}
                onClose={() => {
                    setShowAddTask(false);
                    refreshData(); // Refresh after add
                }}
                availableAgents={agents}
            />
        </div>
    );
}
