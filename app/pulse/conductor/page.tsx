'use client';

import { Header } from '@/components/Header';
import { AgentGrid } from '@/components/AgentGrid';
import { CostTicker } from '@/components/CostTicker';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { TaskQueue } from '@/components/TaskQueue';
import { ActivityFeed } from '@/components/ActivityFeed';
import { useEffect, useState } from 'react';
import { AgentRegistryRecord, Task } from '@/lib/agent/types'; // New Types
import { AGENT_GROUPS } from '@/lib/agent/groups'; // 3x3 Groups
import { useSupabaseSubscription } from '@/hooks/useSupabaseSubscription';
import QRCode from 'qrcode';
import { AddTaskModal } from '@/components/modals/AddTaskModal';
import { Skeleton } from '@/components/ui/Skeleton';
import { Skull, ServerCrash, Share2, Activity } from 'lucide-react'; // New Icons

export default function ConductorPage() {
    const [agents, setAgents] = useState<AgentRegistryRecord[]>([]); // New Type
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [showShare, setShowShare] = useState(false);
    const [showAddTask, setShowAddTask] = useState(false);
    const [qrUrl, setQrUrl] = useState('');

    // Initial Data Fetch
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            // Fetch from NEW RepID Table
            const { data: agentData } = await supabase.from('trinity_agent_registry').select('*').order('agent_name');
            if (agentData) setAgents(agentData as AgentRegistryRecord[]);

            // Fetch tasks (assuming trinity_tasks is still valid or needs update)
            const { data: taskData } = await supabase.from('trinity_tasks').select('*').neq('status', 'completed').order('priority', { ascending: false });
            if (taskData) setTasks(taskData as any); // Temporary cast until Task types are unified

            setLoading(false);
        };
        fetchData();
    }, []);

    // Realtime Subscriptions
    useSupabaseSubscription('trinity_agent_registry', (payload) => {
        supabase.from('trinity_agent_registry').select('*').order('agent_name').then(({ data }) => {
            if (data) setAgents(data as AgentRegistryRecord[]);
        });
    });

    const generateInvite = async () => {
        const code = Math.random().toString(36).substring(7);
        const url = `https://aitrinitysymphony.com/pulse?i=${code}`;
        const qr = await QRCode.toDataURL(url, { color: { dark: '#e4e4e7', light: '#00000000' } });
        setQrUrl(qr);
        setShowShare(true);
    };

    return (
        <div className="min-h-screen bg-obsidian-base flex flex-col">
            <Header
                title="CONDUCTOR CONSOLE"
                showLive
                viewerCount={12}
                rightContent={
                    <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={generateInvite}>Share Access</Button>
                    </div>
                }
            />

            <main className="flex-1 container mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-140px)]">

                {/* LEFT COLUMN: Grid & Activity */}
                <div className="lg:col-span-3 flex flex-col gap-6 h-full overflow-hidden">

                    {/* NEW: Chaos & Squad Panel */}
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
                                    <button onClick={() => alert('Agent Killed')} className="px-3 py-1 bg-red-950/50 border border-red-900/30 text-red-300 text-xs rounded hover:bg-red-900/80 transition-colors">
                                        Kill Random
                                    </button>
                                    <button onClick={() => alert('DB Severed')} className="px-3 py-1 bg-orange-950/50 border border-orange-900/30 text-orange-300 text-xs rounded hover:bg-orange-900/80 transition-colors">
                                        Sever DB
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 3x3 Squad Status */}
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Share2 className="w-4 h-4 text-blue-500" />
                                <h2 className="text-sm font-bold text-zinc-100">Squad Status</h2>
                            </div>
                            <div className="flex gap-2">
                                {Object.values(AGENT_GROUPS).map(group => (
                                    <div key={group.id} className="flex-1 bg-black/40 py-1.5 px-2 rounded border border-zinc-800/50 text-center">
                                        <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-0.5">{group.name.split(' ')[0]}</div>
                                        <div className="text-green-400 text-[10px] font-mono font-bold">ONLINE</div>
                                    </div>
                                ))}
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
                                    <span className="text-xs text-status-online bg-status-online/10 px-2 py-1 rounded border border-status-online/20">
                                        {agents.filter(a => a.status === 'active').length}/{agents.length} Online
                                    </span>
                                )}
                            </div>
                        </div>

                        {loading ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
                            </div>
                        ) : (
                            <AgentGrid agents={agents} isConductor={true} />
                        )}
                    </div>

                    {/* Activity Feed (Bottom) */}
                    <div className="h-48 shrink-0">
                        <ActivityFeed />
                    </div>
                </div>

                {/* RIGHT COLUMN: Tasks & Stats */}
                <div className="lg:col-span-1 flex flex-col gap-6 h-full">
                    <div className="h-1/2">
                        {/* Temporarily using any for tasks until type unification */}
                        <TaskQueue tasks={tasks as any} onAddTask={() => setShowAddTask(true)} />
                    </div>

                    <div className="h-1/2 flex flex-col gap-4">
                        {/* Quick Actions / Stats */}
                        <div className="p-4 bg-obsidian-surface border border-obsidian-border rounded-lg">
                            <h3 className="text-sm font-bold text-text-primary mb-3">System Health</h3>
                            <div className="space-y-2 text-sm text-text-secondary">
                                <div className="flex justify-between">
                                    <span>Response Time</span>
                                    <span className="text-status-online font-mono">24ms</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Error Rate</span>
                                    <span className="text-status-online font-mono">0.01%</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Tokens/sec</span>
                                    <span className="text-accent-violet font-mono">842</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 p-4 bg-obsidian-surface border border-obsidian-border rounded-lg flex flex-col justify-center items-center text-center">
                            <h3 className="text-sm text-text-muted mb-2">Daily Efficiency</h3>
                            <span className="text-4xl font-bold text-status-online">99.9%</span>
                            <span className="text-xs text-text-muted mt-1">Optimization active</span>
                        </div>
                    </div>
                </div>

            </main>

            <CostTicker traditional={847.00} trinity={0.47} />

            {/* Manual Modal Implementation (Share) */}
            {showShare && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowShare(false)}>
                    <div className="bg-obsidian-elevated border border-obsidian-border rounded-xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-text-primary mb-4 text-center">Secure Invite Link</h3>
                        <div className="bg-white p-4 rounded-lg mb-4 flex justify-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={qrUrl} alt="Invite QR" className="w-48 h-48" />
                        </div>
                        <p className="text-center text-text-muted text-sm mb-6">
                            Scan to grant instant observatory access.
                        </p>
                        <Button className="w-full" onClick={() => setShowShare(false)}>
                            Close
                        </Button>
                    </div>
                </div>
            )}

            <AddTaskModal
                isOpen={showAddTask}
                onClose={() => setShowAddTask(false)}
                availableAgents={agents} // Now expects AgentRegistryRecord, which we supply
            />
        </div>
    );
}
