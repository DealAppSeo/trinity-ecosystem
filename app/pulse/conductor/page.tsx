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
import Link from 'next/link';
import { Skull, Share2, AlertTriangle, ServerCrash, Activity } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTrinityController } from '@/hooks/useTrinityController';
import { toast } from 'sonner';
import { AGENT_GROUPS } from '@/lib/agent/groups';
import { RewardTuner } from '@/components/RewardTuner';
import { cn } from '@/lib/utils';
import { ConstitutionalHeartbeat } from '@/components/ConstitutionalHeartbeat';
import { InfraHealthCard } from '@/components/InfraHealthCard';
import { HITLActionCenter } from '@/components/HITLActionCenter';
import { SovereignMemoryExplorer } from '@/components/SovereignMemoryExplorer';

export default function ConductorPage() {
    // consolidated logic via hook
    const {
        agents, tasks, logs, heartbeats, stats, sovereignData,
        loading, createTask, refresh, killRandomAgent, triggerChaosEvent
    } = useTrinityController();

    // Stats are now fetched via Realtime hook
    const [showAddTask, setShowAddTask] = useState(false);
    const [activeTab, setActiveTab] = useState<'grid' | 'tasks' | 'logs'>('grid');
    const [role, setRole] = useState<'founder' | 'guest'>('guest');

    useEffect(() => {
        const roleMatch = document.cookie.match(/trinity_role=([^;]+)/);
        if (roleMatch) {
            setRole(roleMatch[1] as any);
        } else {
            // Fallback to localStorage
            const localRole = localStorage.getItem('trinity_role');
            if (localRole) setRole(localRole as any);
        }
    }, []);

    const isFounder = role === 'founder';

    // Initial load happens in hook. Realtime subscriptions handle subsequent updates.
    // No explicit refresh interval needed here.

    // Derived stats for UI if API fails or for instant updates
    const filteredAgents = agents.filter(a => a.agent_name !== 'trinity-ecosystem' && a.agent_name !== 'trinity-science');
    const onlineCount = filteredAgents.filter(a => ['online', 'blue', 'amber'].includes(a.status)).length;
    const busyCount = filteredAgents.filter(a => (a as any).current_task_summary && (a as any).current_task_summary !== 'Idle' && (a as any).status !== 'offline').length;

    // Ecosystem/Network Entities
    const ecosystemAgents = agents.filter(a => a.agent_name === 'trinity-ecosystem' || a.agent_name === 'trinity-science');

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
        toast.promise(
            fetch('/api/captain', {
                method: 'POST',
                body: JSON.stringify({ action: 'SEND_SIGNAL', signal: 'SYSTEM_WAKE' }),
                headers: { 'Content-Type': 'application/json' }
            }),
            {
                loading: 'Dispatching wake signal...',
                success: 'Swarm wake signal sent!',
                error: 'Failed to wake swarm'
            }
        );
    };

    const resetTrinity = async () => {
        if (!confirm('🚨 KILL ALL ACTION AND REBOOT? This will clear all "Doing" tasks and mark the swarm offline. Use this for emergency recovery.')) return;

        const promise = fetch('/api/captain', {
            method: 'POST',
            body: JSON.stringify({ action: 'SEND_SIGNAL', signal: 'SYSTEM_RESET' }),
            headers: { 'Content-Type': 'application/json' }
        });

        toast.promise(promise, {
            loading: 'Resetting system...',
            success: 'System reset completed!',
            error: 'Failed to reset system'
        });

        await promise;
        setTimeout(refresh, 1000);
    };

    const handleHITLApprove = async (id: string) => {
        toast.promise(
            supabase.from('trinity_tasks').update({ status: 'doing', metadata: { approved_by: 'FOUNDER' } }).eq('id', id),
            {
                loading: 'Approving task...',
                success: 'Task approved and released!',
                error: 'Failed to approve task'
            }
        );
    };

    const handleHITLReject = async (id: string) => {
        toast.promise(
            supabase.from('trinity_tasks').update({ status: 'cancelled', metadata: { rejected_by: 'FOUNDER' } }).eq('id', id),
            {
                loading: 'Rejecting task...',
                success: 'Task rejected and stalled.',
                error: 'Failed to reject task'
            }
        );
    };

    // --- SHARE FEATURE ---

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
                        {/* Iron Gate Banner (Guest Mode) */}
                        {!isFounder && (
                            <div className="lg:col-span-4 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between mb-4 animate-in slide-in-from-top duration-500">
                                <div className="flex items-center gap-3">
                                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                                    <div>
                                        <p className="text-sm font-bold text-amber-400">Guest Access: Read-Only Mode</p>
                                        <p className="text-xs text-amber-500/70">You can monitor swarm activity, but controls are reserved for Founders.</p>
                                    </div>
                                </div>
                                <Link href="/join">
                                    <Button variant="secondary" size="sm" className="bg-amber-500/20 border-amber-500/30 text-amber-400 hover:bg-amber-500/30">
                                        Take Command →
                                    </Button>
                                </Link>
                            </div>
                        )}

                        {/* Mobile Tab Switcher */}
                        <div className="lg:hidden flex border-b border-white/5 bg-obsidian-surface/50 rounded-t-xl overflow-hidden shrink-0">
                            {(['grid', 'tasks', 'logs'] as const).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={cn(
                                        "flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all",
                                        activeTab === tab
                                            ? "bg-white/10 text-cyan-400 border-b-2 border-cyan-400"
                                            : "text-zinc-500"
                                    )}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        {/* LEFT COLUMN: Grid & Activity (Active State) */}
                        <div className={cn(
                            "lg:col-span-3 flex flex-col gap-6 h-full overflow-hidden",
                            activeTab !== 'grid' && 'hidden lg:flex'
                        )}>

                            {/* Sovereign Dashboard Row 1 */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
                                <ConstitutionalHeartbeat
                                    status={sovereignData?.governance?.recent_events?.some((e: any) => e.message?.includes('VIOLATION')) ? 'violating' : 'aligned'}
                                    recentEvents={sovereignData?.governance?.recent_events}
                                />
                                <InfraHealthCard
                                    services={sovereignData?.infra?.services || []}
                                    status={sovereignData?.infra?.status || 'healthy'}
                                />
                                <SovereignMemoryExplorer
                                    nodeCount={sovereignData?.graph?.nodes || 0}
                                    relationCount={sovereignData?.graph?.relationships || 0}
                                    lastSync={sovereignData?.graph?.last_sync}
                                />
                            </div>

                            {/* Chaos & Triad Row */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                                {/* System Status Summary */}
                                <div className="md:col-span-1 bg-gradient-to-r from-emerald-500/10 to-emerald-900/10 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                                            <Activity className="w-5 h-5 text-emerald-400" />
                                        </div>
                                        <div>
                                            <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                                Active
                                                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">v1.0.2</span>
                                            </h2>
                                            <p className="text-[10px] text-zinc-400">{onlineCount} agents / {stats?.active_tasks || 0} tasks</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Chaos Testing */}
                                <div className={cn(
                                    "bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 relative overflow-hidden group",
                                    !isFounder && "opacity-50 grayscale pointer-events-none"
                                )}>
                                    <div className="absolute inset-0 bg-red-900/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <div className="flex items-start justify-between relative z-10">
                                        <div className="flex items-center gap-2">
                                            <Skull className="w-5 h-5 text-red-500" />
                                            <div>
                                                <h2 className="text-sm font-bold text-zinc-100">Chaos Testing</h2>
                                            </div>
                                        </div>
                                        {isFounder && (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={wakeTrinity}
                                                    className="px-2 py-1 bg-emerald-950/50 border border-emerald-900/30 text-emerald-300 text-[10px] rounded hover:bg-emerald-900/80 transition-colors"
                                                >
                                                    Wake
                                                </button>
                                                <button
                                                    onClick={resetTrinity}
                                                    className="px-2 py-1 bg-red-950/50 border border-red-900/30 text-red-300 text-[10px] rounded hover:bg-red-900/80 transition-colors"
                                                >
                                                    Kill All
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Squad Status Summary */}
                                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 relative overflow-hidden">
                                    <div className="grid grid-cols-4 gap-2">
                                        {Object.values(AGENT_GROUPS).map(group => {
                                            const groupAgents = agents.filter(a => group.members.includes(a.agent_name));
                                            const onlineCount = groupAgents.filter(a => ['online', 'active', 'green', 'blue'].includes(a.status)).length;
                                            const busyCount = groupAgents.filter(a => (a as any).current_task_summary && (a as any).current_task_summary !== 'Idle').length;
                                            const total = group.members.length;
                                            return (
                                                <div key={group.id} className={cn(
                                                    "relative bg-black/40 py-2 px-1 rounded border min-w-0 transition-all",
                                                    busyCount > 0 ? "border-emerald-500/40" : "border-zinc-800/50"
                                                )}>
                                                    <div className="text-[7px] text-zinc-500 uppercase tracking-tighter mb-1 truncate text-center px-1">
                                                        {group.id === 'ORCHESTRATION' ? 'ORCH' : group.name.split(' ')[0]}
                                                    </div>
                                                    <div className="text-[10px] font-mono font-bold text-center">
                                                        {onlineCount}/{total}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Reward Tuner & Grid */}
                            <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                                <div className={cn(!isFounder && "opacity-50 grayscale pointer-events-none shrink-0")}>
                                    <RewardTuner />
                                </div>

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
                                            agents={filteredAgents}
                                            isConductor={true}
                                            onAssignTask={(agentName) => {
                                                console.log('Assign to', agentName);
                                            }}
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Activity Feed (Bottom) */}
                            <div className="h-48 shrink-0">
                                <ActivityFeed logs={logs} />
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Tasks & HITL */}
                        <div className={cn(
                            "lg:col-span-1 flex flex-col gap-6 h-full",
                            activeTab !== 'tasks' && 'hidden lg:flex'
                        )}>
                            {/* HITL Action Center */}
                            <HITLActionCenter
                                pendingEvents={tasks.filter(t => t.status === 'pending_clarification').map(t => ({
                                    id: t.id,
                                    title: t.title,
                                    type: (t as any).task_type === 'phone_validation' ? 'phone' : 'clarification',
                                    agent: t.claimed_by || 'Unknown',
                                    timestamp: t.created_at
                                }))}
                                onApprove={handleHITLApprove}
                                onReject={handleHITLReject}
                            />

                            {/* Invite Manager */}
                            <div className="shrink-0">
                                <InviteManager supabase={supabase} />
                            </div>

                            {/* Task Queue */}
                            <div className="flex-1 flex flex-col min-h-0">
                                <TaskQueue
                                    tasks={tasks as any}
                                    onAddTask={() => setShowAddTask(true)}
                                />
                            </div>

                            <button
                                onClick={() => confirm('⚠️ EMERGENCY PAUSE ALL AGENTS?') && triggerChaosEvent('SYSTEM_HALT')}
                                disabled={!isFounder}
                                className={cn(
                                    "w-full bg-red-900/50 hover:bg-red-900 text-red-200 border border-red-700 py-3 rounded-lg font-bold flex items-center justify-center gap-2",
                                    !isFounder && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                <ServerCrash className="w-4 h-4" /> EMERGENCY PAUSE
                            </button>
                        </div>

                        {/* MOBILE LOGS VIEW */}
                        <div className={cn(
                            "lg:hidden flex flex-col gap-6 h-[70vh]",
                            activeTab !== 'logs' && 'hidden'
                        )}>
                            <ActivityFeed logs={logs} />
                        </div>
                    </>
                )}

            </main>

            {/* Networks & Infrastructure Row */}
            <div className="container mx-auto px-4 py-8 border-t border-white/5 mt-8">
                <div className="flex items-center gap-2 mb-6">
                    <Share2 className="w-5 h-5 text-accent-blue" />
                    <h2 className="text-lg font-bold text-white uppercase tracking-widest">Ecosystem Infrastructure</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Ecosystem Special View */}
                    {ecosystemAgents.map(entity => (
                        <div key={entity.agent_name} className="bg-zinc-900/40 border border-white/5 rounded-xl p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "w-3 h-3 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.3)]",
                                    entity.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'
                                )} />
                                <div>
                                    <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-tighter">{entity.agent_name}</h3>
                                    <p className="text-[10px] text-zinc-500">{entity.current_task_summary || 'System Ready'}</p>
                                </div>
                            </div>
                            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-white/5 uppercase">Network</span>
                        </div>
                    ))}

                    {/* System Status Indicators */}
                    <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]" />
                            <div>
                                <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-tighter">n8n Bridge</h3>
                                <p className="text-[10px] text-zinc-500">Automation Active</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]" />
                            <div>
                                <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-tighter">Flowise</h3>
                                <p className="text-[10px] text-zinc-500">Reasoning Nodes Online</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]" />
                            <div>
                                <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-tighter">PostgreSQL</h3>
                                <p className="text-[10px] text-zinc-500">State Store Online</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]" />
                            <div>
                                <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-tighter">Memory Graph</h3>
                                <p className="text-[10px] text-zinc-500">Neo4j/Memgraph Ready</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <main className="min-h-[100px]" /> {/* Spacer */}

            <CostTicker traditional={847.00} trinity={0.47} googleStitch={0.0} />

            <AddTaskModal
                isOpen={showAddTask}
                onClose={() => {
                    setShowAddTask(false);
                    refresh();
                }}
                availableAgents={agents}
            />
        </div>
    );
}
