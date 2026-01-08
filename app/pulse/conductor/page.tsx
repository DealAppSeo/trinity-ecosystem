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
import { Skull, Share2, AlertTriangle, ServerCrash } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTrinityController } from '@/hooks/useTrinityController';
import { AGENT_GROUPS } from '@/lib/agent/groups';

export default function ConductorPage() {
    // consolidated logic via hook
    const { agents, tasks, logs, heartbeats, loading, createTask, refresh, killRandomAgent, triggerChaosEvent } = useTrinityController();
    const [stats, setStats] = useState({ online_agents: 0, tasks_completed_24h: 0, active_tasks: 0 });
    const [showAddTask, setShowAddTask] = useState(false);

    // Initial Fetch + Interval for Hook Refresh & Stats
    useEffect(() => {
        refresh(); // initial load via hook

        const interval = setInterval(() => {
            refresh();
            // Fetch stats separately as they aren't in the hook yet (could assume from agents/tasks but simpler to keep fetch)
            fetch('/api/stats').then(r => r.ok && r.json().then(setStats));
        }, 10000);

        return () => clearInterval(interval);
    }, [refresh]);

    // Derived stats for UI if API fails or for instant updates
    const onlineCount = agents.filter(a => a.status === 'active').length;

    // --- CAPTAIN FEATURES ---
    const [northStar, setNorthStar] = useState('');
    const [isSavingNS, setIsSavingNS] = useState(false);

    useEffect(() => {
        fetch('/api/captain').then(r => r.json()).then(data => {
            if (data?.north_star_directive) setNorthStar(data.north_star_directive);
        });
    }, []);

    const updateNorthStar = async () => {
        setIsSavingNS(true);
        await fetch('/api/captain', {
            method: 'POST',
            body: JSON.stringify({ action: 'UPDATE_NORTH_STAR', north_star: northStar })
        });
        setIsSavingNS(false);
    };

    const wakeTrinity = async () => {
        if (!confirm('⚠️ WAKE ALL AGENTS? This will signal the swarm to startup.')) return;
        await fetch('/api/captain', {
            method: 'POST',
            body: JSON.stringify({ action: 'SEND_SIGNAL', signal: 'SYSTEM_WAKE' })
        });
        alert('SIGNAL SENT: SYSTEM_WAKE');
    };

    return (
        <div className="min-h-screen bg-obsidian-base flex flex-col">
            <Header
                title="TRINITY V2 CONTROLLER (ANTIFRAGILE)"
                showLive
                viewerCount={onlineCount}
                rightContent={
                    <div className="flex gap-4 items-center">
                        <div className="flex gap-2 text-xs text-white/30 font-mono items-center">
                            <a href="/" className="hover:text-white transition-colors mr-4">Home</a>
                            CONNECTED: CONTROLLER.AITRINITYSYMPHONY.COM
                        </div>
                        {/* CAPTAIN CONTROLS */}
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={northStar}
                                onChange={(e) => setNorthStar(e.target.value)}
                                onBlur={updateNorthStar}
                                placeholder="Set North Star Directive..."
                                className="bg-zinc-900 border border-zinc-700 text-xs px-3 py-1.5 rounded w-64 text-zinc-300 focus:border-accent-violet focus:outline-none transition-colors"
                            />
                            {onlineCount === 0 && (
                                <button
                                    onClick={wakeTrinity}
                                    className="px-3 py-1.5 bg-red-900/50 hover:bg-red-800 text-red-200 text-xs font-bold rounded border border-red-700 animate-pulse flex items-center gap-2"
                                >
                                    <Share2 className="w-3 h-3" /> WAKE
                                </button>
                            )}
                        </div>
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
                                    <button
                                        onClick={() => confirm('Kill Random Agent?') && killRandomAgent()}
                                        className="px-3 py-1 bg-red-950/50 border border-red-900/30 text-red-300 text-xs rounded hover:bg-red-900/80 transition-colors flex items-center gap-1"
                                    >
                                        <Skull className="w-3 h-3" /> Kill Random
                                    </button>
                                    <button
                                        onClick={() => confirm('Sever DB Connection?') && triggerChaosEvent('DB_SEVERED')}
                                        className="px-3 py-1 bg-orange-950/50 border border-orange-900/30 text-orange-300 text-xs rounded hover:bg-orange-900/80 transition-colors flex items-center gap-1"
                                    >
                                        <ServerCrash className="w-3 h-3" /> Sever DB
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Squad Status Summary (3x3 Grid) */}
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Share2 className="w-4 h-4 text-blue-500" />
                                <h2 className="text-sm font-bold text-zinc-100">Squad Status ({Object.keys(AGENT_GROUPS).length})</h2>
                            </div>
                            <div className="grid grid-cols-4 gap-2"> {/* 4 cols for Orchestration + 3 Squads */}
                                {Object.values(AGENT_GROUPS).map(group => {
                                    // Calculate online count for this group
                                    const groupAgents = agents.filter(a => group.members.includes(a.agent_name));
                                    const onlineCount = groupAgents.filter(a => a.status === 'active').length;
                                    const total = group.members.length;

                                    return (
                                        <div key={group.id} className="bg-black/40 py-1.5 px-2 rounded border border-zinc-800/50 text-center">
                                            <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">{group.name.split(' ')[0]}</div>
                                            <div className={`text-[10px] font-mono font-bold ${onlineCount === total ? 'text-green-400' : 'text-yellow-400'}`}>
                                                {onlineCount}/{total}
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
                                {loading && agents.length === 0 ? (
                                    <Skeleton className="w-24 h-6" />
                                ) : (
                                    <span className="text-xs text-status-online bg-status-online/10 px-2 py-1 rounded border border-status-online/20 flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${onlineCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                                        {onlineCount}/12 Systems Active
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
                        {/* Passing logs to ActivityFeed if it supported it, or just relying on its internal fetch. 
                            For now, assuming ActivityFeed fetches its own, but we could upgrade it later. */}
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
                                <span className="text-status-online font-mono">{onlineCount}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Tasks (24h)</span>
                                <span className="text-blue-400 font-mono">{stats.tasks_completed_24h}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Queue Load</span>
                                <span className="text-accent-violet font-mono">{tasks.length}</span>
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
                    refresh(); // Refresh after add
                }}
                availableAgents={agents}
            />
        </div>
    );
}
