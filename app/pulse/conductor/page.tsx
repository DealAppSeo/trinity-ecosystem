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
import { Skull, Share2, AlertTriangle, ServerCrash, Activity, Mic, MicOff } from 'lucide-react';
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
import { VoiceInput } from '@/components/VoiceInput';
import { ZKPRepIDBadge } from '@/components/repid/ZKPRepIDBadge';

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
        fetch('/api/captain', {
            headers: {
                'x-trinity-admin-key': process.env.NEXT_PUBLIC_TRINITY_ADMIN_KEY || localStorage.getItem('trinity_admin_key') || ''
            }
        }).then(r => r.json()).then(data => {
            if (data?.north_star_directive) setNorthStar(data.north_star_directive);
        });
    }, []);

    const updateNorthStar = async () => {
        setIsSavingNS(true);
        const promise = fetch('/api/captain', {
            method: 'POST',
            body: JSON.stringify({ action: 'UPDATE_NORTH_STAR', north_star: northStar }),
            headers: { 
                'Content-Type': 'application/json',
                'x-trinity-admin-key': process.env.NEXT_PUBLIC_TRINITY_ADMIN_KEY || localStorage.getItem('trinity_admin_key') || ''
            }
        }).then(async res => {
            if (!res.ok) throw new Error(await res.text() || 'Failed to update');
            return res;
        });

        toast.promise(promise, {
            loading: 'Updating North Star...',
            success: 'North Star directive updated!',
            error: (err) => `Failed to update: ${err.message || 'Unknown error'}`
        });

        await promise.catch(() => {});
        setIsSavingNS(false);
    };

    const wakeTrinity = async () => {
        const promise = fetch('/api/captain', {
            method: 'POST',
            body: JSON.stringify({ action: 'SEND_SIGNAL', signal: 'SYSTEM_WAKE' }),
            headers: { 
                'Content-Type': 'application/json',
                'x-trinity-admin-key': process.env.NEXT_PUBLIC_TRINITY_ADMIN_KEY || localStorage.getItem('trinity_admin_key') || ''
            }
        }).then(async res => {
            if (!res.ok) throw new Error(await res.text() || 'Failed');
            return res;
        });

        toast.promise(promise, {
            loading: 'Dispatching wake signal...',
            success: 'Swarm wake signal sent!',
            error: (err) => `Failed to wake swarm: ${err.message || 'Unknown error'}`
        });
    };

    const resetTrinity = async () => {
        if (!confirm('🚨 KILL ALL ACTION AND REBOOT? This will clear all "Doing" tasks and mark the swarm offline. Use this for emergency recovery.')) return;

        const promise = fetch('/api/captain', {
            method: 'POST',
            body: JSON.stringify({ action: 'SEND_SIGNAL', signal: 'SYSTEM_RESET' }),
            headers: { 
                'Content-Type': 'application/json',
                'x-trinity-admin-key': process.env.NEXT_PUBLIC_TRINITY_ADMIN_KEY || localStorage.getItem('trinity_admin_key') || ''
            }
        }).then(async res => {
            if (!res.ok) throw new Error(await res.text() || 'Failed');
            return res;
        });

        toast.promise(promise, {
            loading: 'Resetting system...',
            success: 'System reset completed!',
            error: (err) => `Failed to reset system: ${err.message || 'Unknown error'}`
        });

        await promise.catch(() => {});
        setTimeout(refresh, 1000);
    };

    const handleHITLApprove = async (id: string) => {
        const promise = supabase.from('trinity_tasks').update({ status: 'doing', metadata: { approved_by: 'FOUNDER' } }).eq('id', id).then(({ error }) => { if (error) throw error; });
        toast.promise(promise, {
            loading: 'Approving task...',
            success: 'Task approved and released!',
            error: (err) => `Failed to approve task: ${err.message || 'Unknown error'}`
        });
    };

    const handleHITLReject = async (id: string) => {
        const promise = supabase.from('trinity_tasks').update({ status: 'cancelled', metadata: { rejected_by: 'FOUNDER' } }).eq('id', id).then(({ error }) => { if (error) throw error; });
        toast.promise(promise, {
            loading: 'Rejecting task...',
            success: 'Task rejected and stalled.',
            error: (err) => `Failed to reject task: ${err.message || 'Unknown error'}`
        });
    };

    // --- SHARE FEATURE ---

    const handleVoiceCommand = async (transcript: string) => {
        const cmd = transcript.toLowerCase();

        if (cmd.includes('wake') || cmd.includes('start') || cmd.includes('activate')) {
            await wakeTrinity();
        } else if (cmd.includes('reboot') || cmd.includes('reset') || cmd.includes('restart')) {
            await resetTrinity();
        } else if (cmd.includes('status') || cmd.includes('report') || cmd.includes('check')) {
            toast.info(`System Status: ${onlineCount} agents active, ${busyCount} working.`);
        } else {
            toast(`Command heard: "${transcript}"`, {
                description: "I'm still learning to parse complex voice commands.",
            });
        }
    };

    return (
        <div className="min-h-screen bg-obsidian-base flex flex-col pb-24 md:pb-0">
            {/* North Star Directive Input */}
            <div className="container mx-auto px-4 py-2 mb-4 flex gap-3">
                <div className="flex-1">
                    <input
                        type="text"
                        value={northStar}
                        onChange={(e) => setNorthStar(e.target.value)}
                        onBlur={updateNorthStar}
                        placeholder="Set North Star Directive..."
                        className="w-full bg-zinc-900/50 border border-white/10 text-sm px-4 py-3 rounded-lg text-zinc-300 focus:border-accent-violet focus:ring-1 focus:ring-accent-violet focus:outline-none transition-all placeholder:text-zinc-600"
                    />
                </div>
                <div className="shrink-0 flex items-center">
                    <VoiceInput onTranscript={handleVoiceCommand} />
                </div>
            </div>

            <main className="flex-1 container mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
                {!loading && onlineCount === 0 ? (
                    <div className="lg:col-span-4 flex flex-col items-center justify-center min-h-[50vh] animate-in fade-in zoom-in duration-500">
                        <div className="w-32 h-32 bg-red-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(239,68,68,0.5)]">
                            <span className="text-6xl font-bold text-white">X</span>
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-2">System Offline</h2>
                        <p className="text-zinc-400 mb-8 max-w-md text-center">
                            The swarm is currently dormant. Wake the agents to resume operations and task processing.
                        </p>
                        <div className="flex gap-4 w-full max-w-md">
                            <button onClick={wakeTrinity} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2">
                                <Activity className="w-5 h-5" /> WAKE SWARM
                            </button>
                            <button onClick={resetTrinity} className="flex-1 bg-zinc-800 hover:bg-red-900 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-white/5">
                                <Skull className="w-5 h-5" /> REBOOT
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* LEFT COLUMN: Grid & Activity */}
                        <div className={cn(
                            "lg:col-span-3 flex flex-col gap-6 h-full overflow-hidden",
                            activeTab !== 'grid' && 'hidden lg:flex'
                        )}>
                            {!isFounder && (
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between mb-4 animate-in slide-in-from-top duration-500">
                                    <div className="flex items-center gap-3">
                                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                                        <div>
                                            <p className="text-sm font-bold text-amber-400 uppercase tracking-tighter">Guest: Read-Only</p>
                                        </div>
                                    </div>
                                    <Link href="/join">
                                        <Button variant="secondary" size="sm" className="bg-amber-500/20 border-amber-500/30 text-amber-400">
                                            Take Command →
                                        </Button>
                                    </Link>
                                </div>
                            )}

                            <div className="lg:hidden flex border-b border-white/5 bg-obsidian-surface/50 rounded-t-xl overflow-hidden shrink-0">
                                {(['grid', 'tasks', 'logs'] as const).map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={cn(
                                            "flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all",
                                            activeTab === tab ? "bg-white/10 text-cyan-400 border-b-2 border-cyan-400" : "text-zinc-500"
                                        )}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 shrink-0">
                                <div className="md:col-span-2">
                                    <ConstitutionalHeartbeat
                                        status={sovereignData?.governance?.recent_events?.some((e: any) => e.message?.includes('VIOLATION')) ? 'violating' : 'aligned'}
                                        recentEvents={sovereignData?.governance?.recent_events}
                                    />
                                </div>
                                <div className="md:col-span-1">
                                    <ZKPRepIDBadge agentName="Controller" minRep={100} />
                                </div>
                                <div className="md:col-span-1">
                                    <SovereignMemoryExplorer
                                        nodeCount={sovereignData?.graph?.nodes || 0}
                                        relationCount={sovereignData?.graph?.relationships || 0}
                                        lastSync={sovereignData?.graph?.last_sync}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
                                <div className="md:col-span-1 bg-gradient-to-r from-emerald-500/10 to-emerald-900/10 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                            <Activity className="w-4 h-4 text-emerald-400" />
                                        </div>
                                        <div>
                                            <h2 className="text-[10px] font-black text-white uppercase tracking-tighter">Active <span className="text-emerald-500">v1.0.2</span></h2>
                                            <p className="text-[9px] text-zinc-500 font-mono tracking-tighter text-nowrap">{onlineCount} AGENTS / {stats?.active_tasks || 0} TASKS</p>
                                        </div>
                                    </div>
                                </div>

                                <div className={cn(
                                    "md:col-span-2 bg-zinc-900/50 border border-white/5 rounded-xl p-2 px-4 flex items-center justify-between group",
                                    !isFounder && "opacity-50 grayscale pointer-events-none"
                                )}>
                                    <div className="flex items-center gap-6">
                                        <div className="flex items-center gap-2">
                                            <Skull className="w-4 h-4 text-red-500" />
                                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-tighter">Ops</span>
                                        </div>
                                        {isFounder && (
                                            <div className="flex gap-2 text-nowrap">
                                                <button onClick={wakeTrinity} className="px-3 py-1 bg-emerald-500 text-black text-[10px] font-black uppercase rounded-md hover:bg-emerald-400 transition-all shadow-glow-emerald">Wake</button>
                                                <button onClick={resetTrinity} className="px-3 py-1 bg-red-600 text-white text-[10px] font-black uppercase rounded-md hover:bg-red-500 transition-all shadow-glow-red">Flush</button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="hidden sm:flex items-center gap-4 text-[9px] font-mono text-zinc-600">
                                        <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> RAILWAY: OK</span>
                                        <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> NEON: OK</span>
                                    </div>
                                </div>

                                <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-3">
                                    <div className="grid grid-cols-4 gap-2">
                                        {Object.values(AGENT_GROUPS).map(group => {
                                            const groupAgents = agents.filter(a => group.members.includes(a.agent_name));
                                            const gOnline = groupAgents.filter(a => ['online', 'active', 'green', 'blue'].includes(a.status)).length;
                                            return (
                                                <div key={group.id} className="text-center">
                                                    <div className="text-[7px] text-zinc-600 uppercase tracking-tighter truncate">{group.id.slice(0, 4)}</div>
                                                    <div className="text-[10px] font-mono font-bold text-zinc-400">{gOnline}/{group.members.length}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {sovereignData?.infra?.services?.length > 0 && (
                                <div className="shrink-0 animate-in fade-in duration-500">
                                    <InfraHealthCard services={sovereignData.infra.services} status={sovereignData.infra.status || 'healthy'} />
                                </div>
                            )}

                            <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                                <div className={cn(!isFounder && "opacity-50 grayscale pointer-events-none shrink-0")}>
                                    <RewardTuner />
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[300px]">
                                    <div className="mb-4 flex items-center justify-between">
                                        <h2 className="text-xl font-semibold text-text-primary uppercase tracking-tight">Symphony Swarm</h2>
                                        <span className="text-[10px] text-status-online bg-status-online/10 px-2 py-1 rounded border border-status-online/20 flex items-center gap-2 font-black uppercase">
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                            {onlineCount}/12 Systems Active
                                        </span>
                                    </div>
                                    <AgentGrid agents={filteredAgents} isConductor={true} onAssignTask={(name) => console.log('Assign to', name)} />
                                </div>
                            </div>

                            <div className="h-48 shrink-0">
                                <ActivityFeed logs={logs} />
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Tasks & HITL */}
                        <div className={cn(
                            "lg:col-span-1 flex flex-col gap-6 h-full",
                            activeTab !== 'tasks' && 'hidden lg:flex'
                        )}>
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
                            <div className="shrink-0">
                                <InviteManager supabase={supabase} />
                            </div>
                            <div className="flex-1 flex flex-col min-h-0">
                                <TaskQueue tasks={tasks as any} onAddTask={() => setShowAddTask(true)} />
                            </div>
                            <button
                                onClick={() => confirm('⚠️ EMERGENCY PAUSE ALL AGENTS?') && triggerChaosEvent('SYSTEM_HALT')}
                                disabled={!isFounder}
                                className={cn(
                                    "w-full bg-red-900/50 hover:bg-red-900 text-red-200 border border-red-700 py-3 rounded-lg font-bold flex items-center justify-center gap-2",
                                    !isFounder && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                <ServerCrash className="w-4 h-4" /> SYSTEM HALT
                            </button>
                        </div>
                    </>
                )}
            </main>

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
