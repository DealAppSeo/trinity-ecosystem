'use client';

export const dynamic = 'force-dynamic';

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
import { Skull, Share2, AlertTriangle, ServerCrash, Activity } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTrinityController } from '@/hooks/useTrinityController';
import { AGENT_GROUPS } from '@/lib/agent/groups';
import { ShareModal } from '@/components/modals/ShareModal';
import { RewardTuner } from '@/components/RewardTuner';
import { cn } from '@/lib/utils';

export default function ConductorPage() {
    // consolidated logic via hook
    const { agents, tasks, logs, heartbeats, stats, loading, createTask, refresh, killRandomAgent, triggerChaosEvent } = useTrinityController();

    // Stats are now fetched via Realtime hook
    const [showAddTask, setShowAddTask] = useState(false);

    // Initial load happens in hook. Realtime subscriptions handle subsequent updates.
    // No explicit refresh interval needed here.

    // Derived stats for UI if API fails or for instant updates
    const onlineCount = agents.filter(a => ['online', 'active', 'green', 'blue'].includes(a.status)).length;

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
        if (!confirm('☀️ WAKE ALL AGENTS? This will send keep-alive pings to the entire swarm.')) return;
        await fetch('/api/captain', {
            method: 'POST',
            body: JSON.stringify({ action: 'SEND_SIGNAL', signal: 'SYSTEM_WAKE' })
        });
        alert('SIGNAL DISPATCHED: SWARM WAKE');
    };

    const resetTrinity = async () => {
        if (!confirm('🚨 KILL ALL ACTION AND REBOOT? This will clear all "Doing" tasks and mark the swarm offline. Use this for emergency recovery.')) return;
        await fetch('/api/captain', {
            method: 'POST',
            body: JSON.stringify({ action: 'SEND_SIGNAL', signal: 'SYSTEM_RESET' })
        });
        alert('SYSTEM RESET: Board cleared and agents marked offline.');
        refresh();
    };

    // --- SHARE FEATURE ---
    const [showShareModal, setShowShareModal] = useState(false);

    return (
        <div className="min-h-screen bg-obsidian-base flex flex-col pb-24 md:pb-0">
            {/* North Star Directive Input (Relocated) */}
            <div className="container mx-auto px-4 py-2 mb-4">
                <input
                    type="text"
                    value={northStar}
                    onChange={(e) => setNorthStar(e.target.value)}
                    onBlur={updateNorthStar}
                    placeholder="Set North Star Directive..."
                    className="w-full bg-zinc-900/50 border border-white/10 text-sm px-4 py-3 rounded-lg text-zinc-300 focus:border-accent-violet focus:ring-1 focus:ring-accent-violet focus:outline-none transition-all placeholder:text-zinc-600"
                />
            </div>

            <main className="flex-1 container mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6">

                {/* SHOW BIG RED OFFLINE STATE IF NO AGENTS */}
                {!loading && onlineCount === 0 ? (
                    <div className="lg:col-span-4 flex flex-col items-center justify-center min-h-[50vh] animate-in fade-in zoom-in duration-500">
                        <div className="w-32 h-32 bg-red-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(239,68,68,0.5)]">
                            <span className="text-6xl font-bold text-white">X</span>
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-2">System Offline</h2>
                        <p className="text-zinc-400 mb-8 max-w-md text-center">
                            The swarm is currently dormant. Wake the agents to resume operations and task processing.
                        </p>

                        {/* Stats Row (Offline) */}
                        <div className="grid grid-cols-3 gap-6 w-full max-w-2xl mb-12">
                            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 text-center">
                                <Activity className="w-6 h-6 mx-auto mb-2 text-zinc-500" />
                                <div className="text-3xl font-bold text-white mb-1">0%</div>
                                <div className="text-xs text-zinc-500 uppercase tracking-wider">Uptime</div>
                            </div>
                            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 text-center">
                                <div className="text-3xl font-bold text-white mb-1">5</div>
                                <div className="text-xs text-zinc-500 uppercase tracking-wider">Tasks Today</div>
                            </div>
                            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 text-center">
                                <div className="text-3xl font-bold text-white mb-1">$0.15</div>
                                <div className="text-xs text-zinc-500 uppercase tracking-wider">Saved Today</div>
                            </div>
                        </div>

                        <div className="flex gap-4 w-full max-w-md">
                            <button
                                onClick={wakeTrinity}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <Activity className="w-5 h-5" /> WAKE SWARM
                            </button>
                            <button
                                onClick={resetTrinity}
                                className="flex-1 bg-zinc-800 hover:bg-red-900 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-white/5"
                            >
                                <Skull className="w-5 h-5" /> REBOOT
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* LEFT COLUMN: Grid & Activity (Active State) */}
                        <div className="lg:col-span-3 flex flex-col gap-6 h-full overflow-hidden">

                            {/* Chaos & Squad Panel */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                                {/* System Status Hero */}
                                <div className="md:col-span-3 bg-gradient-to-r from-emerald-500/10 to-emerald-900/10 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                                            <Activity className="w-6 h-6 text-emerald-400" />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                                System Online
                                                <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">v1.0.2</span>
                                            </h2>
                                            <p className="text-sm text-zinc-400">Swarm is active and processing tasks. {onlineCount} agents deployed.</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 pr-4">
                                        <div className="text-right">
                                            <div className="text-2xl font-bold text-emerald-400">{onlineCount}</div>
                                            <div className="text-[10px] text-emerald-500/70 uppercase tracking-wider">Agents</div>
                                        </div>
                                    </div>
                                </div>

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
                                                onClick={wakeTrinity}
                                                className="px-3 py-1 bg-emerald-950/50 border border-emerald-900/30 text-emerald-300 text-xs rounded hover:bg-emerald-900/80 transition-colors flex items-center gap-1"
                                                title="Send Keep-Alive Pings"
                                            >
                                                <Activity className="w-3 h-3" /> Wake Swarm
                                            </button>
                                            <button
                                                onClick={resetTrinity}
                                                className="px-3 py-1 bg-red-950/50 border border-red-900/30 text-red-300 text-xs rounded hover:bg-red-900/80 transition-colors flex items-center gap-1"
                                                title="Emergency Board Reset"
                                            >
                                                <AlertTriangle className="w-3 h-3" /> Kill All
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => confirm('Kill Random Agent?') && killRandomAgent()}
                                            className="px-3 py-1 bg-zinc-900/50 border border-white/5 text-zinc-500 text-[10px] rounded hover:bg-red-950/30 hover:text-red-400 transition-all flex items-center justify-center gap-1"
                                        >
                                            <Skull className="w-3 h-3" /> Kill Random
                                        </button>
                                        <button
                                            onClick={() => triggerChaosEvent('SIMULATED_FAILURE')}
                                            className="px-3 py-1 bg-zinc-900/50 border border-white/5 text-zinc-500 text-[10px] rounded hover:bg-amber-950/30 hover:text-amber-400 transition-all flex items-center justify-center gap-1"
                                        >
                                            <ServerCrash className="w-3 h-3" /> Trip Circuit
                                        </button>
                                    </div>
                                </div>

                                {/* Squad Status Summary (3x3 Grid - Antigravity Refinement) */}
                                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 relative overflow-hidden">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Share2 className="w-4 h-4 text-accent-blue" />
                                            <h2 className="text-sm font-bold text-zinc-100">Swarm Triad Pulse</h2>
                                        </div>
                                        <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-tighter">BFT Ready</span>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2"> {/* Orchestration + 3 Squads */}
                                        {Object.values(AGENT_GROUPS).map(group => {
                                            const groupAgents = agents.filter(a => group.members.includes(a.agent_name));
                                            const onlineCount = groupAgents.filter(a => ['online', 'active', 'green', 'blue'].includes(a.status)).length;
                                            const busyCount = groupAgents.filter(a => (a as any).current_task_summary && (a as any).current_task_summary !== 'Idle').length;
                                            const total = group.members.length;

                                            // Heat Logic: Busy = Hot (Violet/Green), Idle = Cool (Zinc)
                                            // Only if online
                                            const isHot = busyCount > 0;

                                            return (
                                                <div key={group.id} className={cn(
                                                    "relative bg-black/40 py-2 px-1 rounded border transition-all duration-500",
                                                    isHot ? "border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.1)]" : "border-zinc-800/50"
                                                )}>
                                                    <div className="text-[8px] text-zinc-500 uppercase tracking-widest mb-1 truncate text-center">
                                                        {group.name.split(' ')[0]}
                                                    </div>
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <div className={cn(
                                                            "w-1 h-1 rounded-full",
                                                            onlineCount === total ? "bg-emerald-500" : onlineCount > 0 ? "bg-amber-500" : "bg-red-500"
                                                        )} />
                                                        <div className={cn(
                                                            "text-[10px] font-mono font-bold",
                                                            onlineCount === total ? 'text-zinc-200' : 'text-zinc-400'
                                                        )}>
                                                            {onlineCount}/{total}
                                                        </div>
                                                    </div>
                                                    {isHot && (
                                                        <div className="absolute top-0 right-0 p-1">
                                                            <div className="w-1 h-1 bg-emerald-400 rounded-full animate-ping" />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Reward Tuner (ANFIS Control) */}
                                <RewardTuner />
                            </div>

                            {/* Agents Grid */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[300px]">
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
                                <ActivityFeed logs={logs} />
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
                                    tasks={tasks as any}
                                    onAddTask={() => setShowShareModal(true)}
                                />
                            </div>

                            <button
                                onClick={() => confirm('⚠️ EMERGENCY PAUSE ALL AGENTS?') && triggerChaosEvent('SYSTEM_HALT')}
                                className="w-full bg-red-900/50 hover:bg-red-900 text-red-200 border border-red-700 py-3 rounded-lg font-bold flex items-center justify-center gap-2"
                            >
                                <ServerCrash className="w-4 h-4" /> EMERGENCY PAUSE
                            </button>
                        </div>
                    </>
                )}

            </main >

            <CostTicker traditional={847.00} trinity={0.47} />

            <AddTaskModal
                isOpen={showAddTask}
                onClose={() => {
                    setShowAddTask(false);
                    refresh(); // Refresh after add
                }}
                availableAgents={agents}
            />

            <ShareModal
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)}
            />
        </div >
    );
}
